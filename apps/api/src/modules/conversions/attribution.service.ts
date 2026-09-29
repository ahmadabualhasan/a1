import { Injectable } from '@nestjs/common';
import type { AttributionDecision as DecisionRow, Conversion, TransactionClient } from '@codek/database';
import { DEFAULT_ATTRIBUTION_POLICY, decideAttribution, normalizeCode, type AttributionPolicy, type NormalizedOrderEvent, type Touchpoint } from '@codek/domain';
import { toJsonSafe } from '../../common/json';

interface CandidateTouchpoint extends Touchpoint {
  eventType: string;
  sourceRef: string;
  promotionCodeId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Builds attribution evidence (touchpoints) for a conversion and records one immutable, versioned decision
 * (spec §6.2 layer B). Only server-side evidence tied to the business is considered: CODEK codes of this business,
 * click references issued by CODEK's redirect for this business, or a referral token of this business.
 */
@Injectable()
export class AttributionService {
  async collect(tx: TransactionClient, businessId: string, conv: Conversion, e: NormalizedOrderEvent): Promise<CandidateTouchpoint[]> {
    const out: CandidateTouchpoint[] = [];
    const at = conv.occurredAt;
    const seen = new Set<string>();
    for (const raw of e.discountCodes ?? []) {
      const normalized = normalizeCode(raw);
      if (!normalized || seen.has(normalized)) continue;
      seen.add(normalized);
      const found = await tx.promotionCode.findUnique({ where: { businessId_normalizedCode: { businessId, normalizedCode: normalized } }, select: { id: true } });
      if (!found) continue; // merchant's own coupon, not CODEK evidence
      // Lock, then re-read so usage counts are current under concurrent redemptions.
      await tx.$queryRaw`SELECT id FROM promotion_codes WHERE id = ${found.id}::uuid FOR UPDATE`;
      const code = await tx.promotionCode.findUniqueOrThrow({ where: { id: found.id }, include: { partnership: true } });
      let reason: string | null = null;
      if (code.status !== 'active') reason = `CODE_${code.status.toUpperCase()}`;
      else if (code.startsAt && at < code.startsAt) reason = 'CODE_NOT_STARTED';
      else if (code.expiresAt && at >= code.expiresAt) reason = 'CODE_EXPIRED';
      else if (!['active'].includes(code.partnership.status)) reason = `PARTNERSHIP_${code.partnership.status.toUpperCase()}`;
      else if (code.usageLimit != null && code.usageCount >= code.usageLimit) reason = 'USAGE_LIMIT_REACHED';
      else if (code.perCustomerLimit != null && conv.customerRefHash) {
        const used = await tx.promotionCodeRedemption.count({ where: { promotionCodeId: code.id, customerRefHash: conv.customerRefHash } });
        if (used >= code.perCustomerLimit) reason = 'PER_CUSTOMER_LIMIT_REACHED';
      }
      out.push({
        id: `code:${code.id}`,
        method: 'code',
        partnershipId: code.partnershipId,
        creatorId: code.creatorId,
        campaignId: code.campaignId,
        occurredAt: at,
        eligible: reason === null,
        ineligibleReason: reason,
        eventType: 'code_redemption',
        sourceRef: normalized,
        promotionCodeId: code.id,
      });
    }
    if (e.referralClickId) {
      const click = await tx.trackingClick.findUnique({ where: { clickRef: e.referralClickId } });
      if (click && click.businessId === businessId && click.partnershipId) {
        const ps = await tx.partnership.findUniqueOrThrow({ where: { id: click.partnershipId } });
        const reason = click.suspected ? 'SUSPECTED_BOT' : ['cancelled', 'terminated'].includes(ps.status) ? `PARTNERSHIP_${ps.status.toUpperCase()}` : null;
        out.push({
          id: `click:${click.id}`,
          method: click.method === 'qr' ? 'qr' : 'link',
          partnershipId: click.partnershipId,
          creatorId: click.creatorId,
          campaignId: click.campaignId,
          occurredAt: click.occurredAt,
          eligible: reason === null,
          ineligibleReason: reason,
          eventType: click.method === 'qr' ? 'qr_scan' : 'click',
          sourceRef: click.clickRef,
        });
      }
    } else if (e.referralToken) {
      const link = await tx.referralLink.findUnique({ where: { token: e.referralToken }, include: { partnership: true } });
      if (link && link.partnership.businessId === businessId) {
        const reason = link.status !== 'active' ? `LINK_${link.status.toUpperCase()}` : link.partnership.status !== 'active' ? `PARTNERSHIP_${link.partnership.status.toUpperCase()}` : null;
        out.push({
          id: `link:${link.id}`,
          method: 'link',
          partnershipId: link.partnershipId,
          creatorId: link.partnership.creatorId,
          campaignId: link.partnership.campaignId,
          occurredAt: at,
          eligible: reason === null,
          ineligibleReason: reason,
          eventType: 'referral_token',
          sourceRef: link.token,
        });
      }
    }
    return out;
  }

  /** Policy comes from the frozen snapshot of the primary evidence's partnership (D-025). */
  async policyFor(tx: TransactionClient, tps: CandidateTouchpoint[]): Promise<AttributionPolicy> {
    const primary = tps.find((t) => t.method === 'code' && t.partnershipId) ?? [...tps].filter((t) => t.partnershipId).sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())[0];
    if (!primary?.partnershipId) return DEFAULT_ATTRIBUTION_POLICY;
    const ps = await tx.partnership.findUniqueOrThrow({ where: { id: primary.partnershipId } });
    if (!ps.termsSnapshotId) return DEFAULT_ATTRIBUTION_POLICY;
    const snap = await tx.partnershipTermsSnapshot.findUniqueOrThrow({ where: { id: ps.termsSnapshotId } });
    return snap.attributionPolicy as unknown as AttributionPolicy;
  }

  async decide(tx: TransactionClient, businessId: string, conv: Conversion, e: NormalizedOrderEvent, actorUserId: string | null = null): Promise<{ row: DecisionRow; selectedCodeId: string | null }> {
    const tps = await this.collect(tx, businessId, conv, e);
    const policy = await this.policyFor(tx, tps);
    const decision = decideAttribution({ policy, conversionOccurredAt: conv.occurredAt, touchpoints: tps });
    const persisted = new Map<string, string>();
    for (const tp of tps) {
      const row = await tx.attributionTouchpoint.create({
        data: {
          businessId,
          conversionId: conv.id,
          campaignId: tp.campaignId,
          partnershipId: tp.partnershipId,
          creatorId: tp.creatorId,
          method: tp.method,
          eventType: tp.eventType,
          externalEventId: e.externalEventId,
          sourceRef: tp.sourceRef,
          occurredAt: tp.occurredAt,
          eligible: tp.eligible,
          ineligibleReason: tp.ineligibleReason ?? null,
          dedupeKey: `conv:${conv.id}:${tp.id}`,
        },
      });
      persisted.set(tp.id, row.id);
    }
    const competing = decision.competingTouchpoints.map((c) => ({ ...c, touchpointId: persisted.get(c.touchpointId) ?? c.touchpointId }));
    const row = await tx.attributionDecision.create({
      data: {
        businessId,
        conversionId: conv.id,
        selectedPartnershipId: decision.selectedPartnershipId,
        selectedCreatorId: decision.selectedCreatorId,
        selectedTouchpointId: decision.selectedTouchpointId ? persisted.get(decision.selectedTouchpointId) ?? null : null,
        method: decision.method,
        policyId: decision.policyId,
        policyVersion: decision.policyVersion,
        model: decision.model,
        windowSeconds: BigInt(decision.windowSeconds),
        competingTouchpoints: toJsonSafe(competing) as object,
        conflictState: decision.conflictState,
        dedupeState: decision.dedupeState,
        decisionState: decision.decisionState,
        reason: decision.reason,
        decidedBy: actorUserId,
      },
    });
    const selected = tps.find((t) => t.id === decision.selectedTouchpointId);
    return { row, selectedCodeId: selected?.promotionCodeId ?? null };
  }
}
