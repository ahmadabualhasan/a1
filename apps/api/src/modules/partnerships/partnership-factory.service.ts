import { Inject, Injectable } from '@nestjs/common';
import type { Prisma, PrismaClient, TransactionClient } from '@codek/database';
import { sha256Hex, stableStringify } from '@codek/domain';
import { PRISMA } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { OutboxService } from '../../outbox/outbox.service';
import { FeePlanService } from '../../billing/fee-plan.service';
import { SettingsService } from '../../settings/settings.service';
import { ApiError, ruleViolation } from '../../common/errors';
import { toJsonSafe } from '../../common/json';
import { CampaignsService, type CampaignWithRelations } from '../campaigns/campaigns.service';
import { attributionPolicyOf, toRuleSnapshot } from '../campaigns/campaign-rules';
import { PromotionService } from '../promotion/promotion.service';

interface DeliverableSpec {
  type: string;
  description?: string;
  dueDays?: number;
  required?: boolean;
}

/**
 * Creates partnerships with an immutable terms snapshot (spec §4.2, §19 partnership_terms_snapshots),
 * enforcing the participant cap under a row lock so concurrent acceptances cannot exceed it.
 */
@Injectable()
export class PartnershipFactory {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly feePlans: FeePlanService,
    private readonly settings: SettingsService,
    private readonly campaigns: CampaignsService,
    private readonly promotion: PromotionService,
  ) {}

  /** Lock the campaign row for cap checks (SELECT ... FOR UPDATE). */
  async lockCampaign(tx: TransactionClient, campaignId: string): Promise<void> {
    await tx.$queryRaw`SELECT id FROM campaigns WHERE id = ${campaignId}::uuid FOR UPDATE`;
  }

  async assertCapacity(tx: TransactionClient, c: CampaignWithRelations): Promise<void> {
    if (c.participantCap == null) return;
    const taken = await this.campaigns.activeParticipants(c.id, tx);
    if (taken >= c.participantCap) throw ruleViolation('This campaign has reached its creator limit', { reason: 'CAPACITY_REACHED' });
  }

  async buildSnapshot(tx: TransactionClient, c: CampaignWithRelations) {
    if (!c.commissionRule) throw new ApiError('UNSUPPORTED_CONFIGURATION', 'Campaign has no commission terms');
    const rule = toRuleSnapshot(c.commissionRule);
    const policy = attributionPolicyOf(c);
    const feePlan = await this.feePlans.currentFor(c.businessId, tx);
    const legal = await tx.legalDocument.findMany({ where: { status: 'published', documentType: { in: ['creator_agreement', 'commission_terms', 'content_rights_terms', 'refund_dispute_policy'] } }, orderBy: { publishedAt: 'desc' } });
    const legalVersions: Record<string, string> = {};
    for (const d of legal) if (!legalVersions[d.documentType]) legalVersions[d.documentType] = d.version;
    const payoutMin = await this.settings.get<Record<string, number>>('payouts.minimum_minor', { default: 0 });
    const terms = {
      campaign: { id: c.id, name: c.name, currency: c.currency, compensationType: c.compensationType, productServiceProvided: c.productServiceProvided, startAt: c.startAt, endAt: c.endAt, timezone: c.timezone },
      business: { id: c.businessId, displayName: c.business.displayName },
      catalogItem: { id: c.catalogItemId, name: c.catalogItem.name },
      conversionSourceType: c.conversionSourceType,
      conversionApprovalMode: c.conversionApprovalMode,
      disclosureRequirements: c.disclosureRequirements,
      legalVersions,
      campaignConfigVersion: c.configVersion,
    };
    const snapshot = {
      campaignConfigVersion: c.configVersion,
      termsJson: toJsonSafe(terms),
      commissionConfig: toJsonSafe(rule),
      discountConfig: c.customerDiscountConfig,
      attributionPolicy: toJsonSafe(policy),
      deliverablesJson: c.deliverableConfig ?? [],
      contentRightsJson: c.contentRightsConfig ?? null,
      promotionRulesJson: c.promotionRules ?? {},
      payoutScheduleJson: { holdPeriodDays: c.holdPeriodDays, minimumPayoutMinor: payoutMin[c.currency] ?? payoutMin.default ?? 0, currency: c.currency },
      holdPeriodDays: c.holdPeriodDays,
      refundPolicyJson: toJsonSafe({ refundBehavior: rule.refundBehavior, policy: c.cancellationRefundConfig }),
      feePlanJson: toJsonSafe(feePlan),
    };
    return { snapshot, rule, policy, legalVersions };
  }

  /**
   * Create the partnership + snapshot + assets + conversation + deliverables + rights.
   * `status` is 'active' when both parties have agreed to the current terms, 'pending' when the creator must re-confirm.
   */
  async create(
    tx: TransactionClient,
    c: CampaignWithRelations,
    args: { creatorId: string; acceptedByUserId: string; applicationId?: string; invitationId?: string; status: 'active' | 'pending' },
  ) {
    const existing = await tx.partnership.findUnique({ where: { campaignId_creatorId: { campaignId: c.id, creatorId: args.creatorId } } });
    if (existing) throw new ApiError('CONFLICT', 'This creator already has a partnership for this campaign');
    const creator = await tx.creator.findUniqueOrThrow({ where: { id: args.creatorId } });
    const { snapshot, rule, legalVersions } = await this.buildSnapshot(tx, c);
    const now = new Date();
    const partnership = await tx.partnership.create({
      data: {
        businessId: c.businessId,
        creatorId: args.creatorId,
        campaignId: c.id,
        applicationId: args.applicationId,
        invitationId: args.invitationId,
        status: args.status,
        acceptedAt: args.status === 'active' ? now : null,
        attributionPolicyVersion: c.attributionPolicyVersion,
        commissionRuleVersion: String(rule.version),
        legalDocumentVersion: legalVersions.creator_agreement ?? null,
      },
    });
    const hash = sha256Hex(stableStringify({ partnershipId: partnership.id, ...snapshot }));
    const snap = await tx.partnershipTermsSnapshot.create({
      data: {
        partnershipId: partnership.id,
        version: 1,
        ...(snapshot as unknown as Omit<Prisma.PartnershipTermsSnapshotUncheckedCreateInput, 'partnershipId' | 'version' | 'acceptedBy' | 'acceptedAt' | 'hash'>),
        acceptedBy: args.acceptedByUserId,
        acceptedAt: now,
        hash,
      },
    });
    await tx.partnership.update({ where: { id: partnership.id }, data: { termsSnapshotId: snap.id } });
    const assetsActive = args.status === 'active' && c.status === 'active';
    const assets = await this.promotion.generateForPartnership(tx, partnership, c, creator, (c.promotionRules ?? {}) as Record<string, never>, assetsActive);
    await tx.conversation.create({ data: { partnershipId: partnership.id, businessId: c.businessId, creatorId: args.creatorId } });
    const specs = (c.deliverableConfig ?? []) as unknown as DeliverableSpec[];
    if (specs.length) {
      await tx.deliverable.createMany({
        data: specs.map((d) => ({
          partnershipId: partnership.id,
          type: d.type,
          description: d.description,
          required: d.required ?? true,
          dueAt: d.dueDays != null ? new Date(now.getTime() + d.dueDays * 86400000) : null,
        })),
      });
    }
    const rights = c.contentRightsConfig as { ownership: string; organicAllowed: boolean; paidAdsAllowed: boolean; whitelistingAllowed: boolean; durationDays?: number; territory?: string; exclusivity?: object } | null;
    if (rights) {
      await tx.contentRight.create({
        data: {
          partnershipId: partnership.id,
          ownership: rights.ownership,
          organicAllowed: rights.organicAllowed,
          paidAdsAllowed: rights.paidAdsAllowed,
          whitelistingAllowed: rights.whitelistingAllowed,
          durationDays: rights.durationDays,
          territory: rights.territory,
          exclusivityJson: rights.exclusivity ?? undefined,
          termsSnapshotId: snap.id,
        },
      });
    }
    await tx.partnershipEvent.create({ data: { partnershipId: partnership.id, eventType: 'partnership_created', actorUserId: args.acceptedByUserId, data: { status: args.status, snapshotHash: hash } } });
    await this.audit.record({ actorUserId: args.acceptedByUserId, businessId: c.businessId, action: 'partnership.created', objectType: 'partnership', objectId: partnership.id, after: { status: args.status, snapshotId: snap.id, hash } }, tx);
    await this.outbox.enqueue(tx, { eventType: 'PartnershipCreated', aggregateType: 'partnership', aggregateId: partnership.id, businessId: c.businessId, payload: { partnershipId: partnership.id, campaignId: c.id, creatorId: args.creatorId, status: args.status, code: assets.code } });
    return { partnership: { ...partnership, termsSnapshotId: snap.id }, snapshot: snap, assets };
  }
}
