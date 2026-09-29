import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Conversion, ConversionStatus, PrismaClient, TransactionClient } from '@codek/database';
import {
  canTransition,
  ConversionMachine,
  customerTotal,
  eventMapsToConversionType,
  pseudonymize,
  validateAmounts,
  type ConversionStatus as DomainConversionStatus,
  type NormalizedOrderEvent,
} from '@codek/domain';
import type { Env } from '@codek/config';
import { ENV } from '../../config/config.module';
import { PRISMA } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { OutboxService } from '../../outbox/outbox.service';
import { toJsonSafe } from '../../common/json';
import { amountsOf, CommissionService } from '../finance/commission.service';
import { AttributionService } from './attribution.service';

export interface IngestInput {
  businessId: string;
  integrationId?: string | null;
  /** Source system identifier used for deduplication, e.g. "custom", "shopify", "redemption_interface". */
  sourceSystem: string;
  verifiedState: 'verified' | 'self_reported';
  webhookEventId?: string | null;
  event: NormalizedOrderEvent;
  actorUserId?: string | null;
  correlationId?: string | null;
}

export interface IngestResult {
  outcome: 'processed' | 'duplicate' | 'awaiting_conversion' | 'ignored';
  conversionId?: string;
  commissionId?: string | null;
  decisionState?: string;
  note?: string;
}

const CREATE_EVENTS = new Set(['ORDER_CREATED', 'BOOKING_CREATED', 'REDEMPTION_CREATED']);
const PAID_EVENTS = new Set(['ORDER_PAID', 'ORDER_COMPLETED', 'BOOKING_COMPLETED']);

/**
 * Canonical conversion pipeline (spec §6.3):
 * raw event → validation → idempotency → normalization → attribution → conversion state → commission → ledger.
 * One DB transaction per event, serialized per (business, source, external order) with an advisory lock, so
 * duplicate and concurrent deliveries can never create a second conversion or financial effect.
 * Handles out-of-order delivery: refunds/cancellations that arrive first are parked and replayed on creation.
 */
@Injectable()
export class ConversionsService {
  private readonly logger = new Logger('ConversionsService');

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(ENV) private readonly env: Env,
    private readonly attribution: AttributionService,
    private readonly commissions: CommissionService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
  ) {}

  async ingest(input: IngestInput): Promise<IngestResult> {
    const e = input.event;
    if (e.grossMinor != null || e.discountMinor != null) {
      validateAmounts({ currency: e.currency ?? 'XXX', grossMinor: e.grossMinor ?? 0n, discountMinor: e.discountMinor ?? 0n, taxMinor: e.taxMinor ?? 0n, shippingMinor: e.shippingMinor ?? 0n, otherFeeMinor: e.otherFeeMinor ?? 0n, netMinor: e.netMinor });
    }
    const result = await this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`conv:${input.businessId}:${input.sourceSystem}:${e.externalRef}`}))`;
        const dup = await tx.conversionEvent.findUnique({ where: { businessId_source_externalEventId: { businessId: input.businessId, source: input.sourceSystem, externalEventId: e.externalEventId } } });
        if (dup) return { outcome: 'duplicate', conversionId: dup.conversionId ?? undefined } satisfies IngestResult;
        const evRow = await tx.conversionEvent.create({
          data: {
            businessId: input.businessId,
            webhookEventId: input.webhookEventId ?? null,
            eventType: e.eventType,
            schemaVersion: e.schemaVersion,
            source: input.sourceSystem,
            externalEventId: e.externalEventId,
            occurredAt: e.occurredAt,
            payloadJson: toJsonSafe(e) as object,
            correlationId: input.correlationId ?? null,
          },
        });
        let conv = await tx.conversion.findUnique({ where: { businessId_sourceSystem_externalRef: { businessId: input.businessId, sourceSystem: input.sourceSystem, externalRef: e.externalRef } } });
        let created = false;
        if (!conv) {
          if (CREATE_EVENTS.has(e.eventType) || PAID_EVENTS.has(e.eventType)) {
            conv = await this.createConversion(tx, input);
            created = true;
          } else {
            await tx.conversionEvent.update({ where: { id: evRow.id }, data: { processingNote: 'awaiting_conversion' } });
            return { outcome: 'awaiting_conversion', note: 'Event stored; it will be applied when the order is received' } satisfies IngestResult;
          }
        }
        await this.applyEvent(tx, conv, input, e, created);
        await tx.conversionEvent.update({ where: { id: evRow.id }, data: { conversionId: conv.id, processingState: 'processed' } });
        if (created) await this.replayParked(tx, conv, input);
        const fresh = await tx.conversion.findUniqueOrThrow({ where: { id: conv.id } });
        const decision = fresh.attributionDecisionId ? await tx.attributionDecision.findUnique({ where: { id: fresh.attributionDecisionId } }) : null;
        const calc = await tx.commissionCalculation.findUnique({ where: { conversionId: conv.id } });
        return { outcome: 'processed', conversionId: conv.id, commissionId: calc?.id ?? null, decisionState: decision?.decisionState } satisfies IngestResult;
      },
      { timeout: 30_000, maxWait: 10_000 },
    );
    return result;
  }

  private async createConversion(tx: TransactionClient, input: IngestInput): Promise<Conversion> {
    const e = input.event;
    const conv = await tx.conversion.create({
      data: {
        businessId: input.businessId,
        integrationId: input.integrationId ?? null,
        type: e.conversionType ?? eventMapsToConversionType(e.eventType),
        status: 'received',
        externalRef: e.externalRef,
        grossMinor: e.grossMinor ?? null,
        discountMinor: e.discountMinor ?? (e.grossMinor != null ? 0n : null),
        taxMinor: e.taxMinor ?? (e.grossMinor != null ? 0n : null),
        shippingFeeMinor: e.shippingMinor ?? (e.grossMinor != null ? 0n : null),
        otherFeeMinor: e.otherFeeMinor ?? (e.grossMinor != null ? 0n : null),
        netMinor: e.netMinor ?? null,
        currency: e.currency ?? null,
        lineItems: e.lineItems ? (toJsonSafe(e.lineItems) as object) : undefined,
        verifiedState: input.verifiedState,
        sourceSystem: input.sourceSystem,
        customerRefHash: e.customerRef ? pseudonymize(e.customerRef, this.env.HASH_PEPPER) : null,
        occurredAt: e.occurredAt,
      },
    });
    await this.setStatus(tx, conv, 'validated');
    const { row, selectedCodeId } = await this.attribution.decide(tx, input.businessId, conv, e, input.actorUserId ?? null);
    const attributed = row.decisionState === 'attributed' && row.selectedPartnershipId;
    let reviewReason: string | null = null;
    if (attributed) {
      const ps = await tx.partnership.findUniqueOrThrow({ where: { id: row.selectedPartnershipId! } });
      await tx.conversion.update({ where: { id: conv.id }, data: { attributionDecisionId: row.id, partnershipId: ps.id, creatorId: ps.creatorId, campaignId: ps.campaignId } });
      await this.setStatus(tx, { ...conv, status: 'validated' }, 'attributed');
      if (selectedCodeId) {
        await tx.promotionCode.update({ where: { id: selectedCodeId }, data: { usageCount: { increment: 1 } } });
        await tx.promotionCodeRedemption.create({ data: { promotionCodeId: selectedCodeId, conversionId: conv.id, customerRefHash: conv.customerRefHash, source: input.sourceSystem } });
      }
      const withLinks = await tx.conversion.findUniqueOrThrow({ where: { id: conv.id } });
      const { calc, reviewReason: rr } = await this.commissions.calculate(tx, withLinks, ps.id);
      reviewReason = rr ?? null;
      const first = (await tx.conversion.count({ where: { partnershipId: ps.id } })) === 1;
      if (first) await tx.partnershipEvent.create({ data: { partnershipId: ps.id, eventType: 'first_conversion', data: { conversionId: conv.id } } });
      if (calc === null && reviewReason) await this.audit.record({ actorType: 'system', businessId: input.businessId, action: 'conversion.commission_needs_review', objectType: 'conversion', objectId: conv.id, reason: reviewReason }, tx);
    } else {
      await tx.conversion.update({ where: { id: conv.id }, data: { attributionDecisionId: row.id } });
    }
    if (reviewReason) await tx.conversion.update({ where: { id: conv.id }, data: { reviewReason } });
    await this.outbox.enqueue(tx, { eventType: 'ConversionRecorded', aggregateType: 'conversion', aggregateId: conv.id, businessId: input.businessId, payload: { conversionId: conv.id, verifiedState: input.verifiedState, sourceSystem: input.sourceSystem } });
    await this.outbox.enqueue(tx, { eventType: 'AttributionResolved', aggregateType: 'conversion', aggregateId: conv.id, businessId: input.businessId, payload: { conversionId: conv.id, decisionId: row.id, decisionState: row.decisionState, conflictState: row.conflictState, partnershipId: row.selectedPartnershipId, creatorId: row.selectedCreatorId } });
    return tx.conversion.findUniqueOrThrow({ where: { id: conv.id } });
  }

  private async applyEvent(tx: TransactionClient, conv: Conversion, input: IngestInput, e: NormalizedOrderEvent, created: boolean): Promise<void> {
    const t = e.eventType;
    if (PAID_EVENTS.has(t) || (t === 'REDEMPTION_CREATED' && input.sourceSystem === 'redemption_interface')) {
      await this.markPaid(tx, conv, input);
    } else if (t === 'ORDER_CANCELLED') {
      await this.cancel(tx, conv, 'order_cancelled');
    } else if (t === 'ORDER_REFUNDED') {
      await this.refund(tx, conv, e.refundedTotalMinor ?? null);
    } else if (!created) {
      // A creation event for an existing conversion (e.g. created after paid arrived first): nothing to change.
    }
  }

  /** Verified payment/completion: auto-approve per snapshot approval mode (D-012), then fund and release. */
  private async markPaid(tx: TransactionClient, conv: Conversion, input: IngestInput): Promise<void> {
    const current = await tx.conversion.findUniqueOrThrow({ where: { id: conv.id } });
    if (!current.paidConfirmedAt) await tx.conversion.update({ where: { id: conv.id }, data: { paidConfirmedAt: new Date() } });
    if (current.verifiedState !== 'verified' || ['cancelled', 'refunded', 'rejected', 'reversed'].includes(current.status)) return;
    const calc = await tx.commissionCalculation.findUnique({ where: { conversionId: conv.id } });
    if (!calc || calc.status !== 'pending' || !current.partnershipId) return;
    const snap = await tx.partnershipTermsSnapshot.findUniqueOrThrow({ where: { id: calc.termsSnapshotId } });
    const mode = (snap.termsJson as { conversionApprovalMode?: string }).conversionApprovalMode ?? 'manual';
    if (mode !== 'auto_verified') return;
    await this.approveInTx(tx, current, input.actorUserId ?? null, 'verified_payment');
  }

  async approveInTx(tx: TransactionClient, conv: Conversion, actorUserId: string | null, reason: string): Promise<void> {
    const calc = await tx.commissionCalculation.findUnique({ where: { conversionId: conv.id } });
    if (calc?.onHold) return;
    if (calc) await this.commissions.approve(tx, calc.id, actorUserId, reason);
    await this.setStatus(tx, conv, 'approved');
    if (calc) {
      await this.commissions.allocateFunding(tx, calc.businessId, calc.currency);
      await this.commissions.releaseDue(tx, new Date(), { businessId: calc.businessId });
    }
  }

  private async cancel(tx: TransactionClient, conv: Conversion, reason: string): Promise<void> {
    const current = await tx.conversion.findUniqueOrThrow({ where: { id: conv.id } });
    await this.setStatus(tx, current, 'cancelled');
    const total = current.currency && current.grossMinor != null ? customerTotal(amountsOf(current)) : 0n;
    await this.commissions.applyRefund(tx, current, total, reason);
  }

  private async refund(tx: TransactionClient, conv: Conversion, cumulative: bigint | null): Promise<void> {
    const current = await tx.conversion.findUniqueOrThrow({ where: { id: conv.id } });
    const total = current.currency && current.grossMinor != null ? customerTotal(amountsOf(current)) : 0n;
    const requested = cumulative ?? total;
    // Cumulative totals make out-of-order partial refunds safe: take the maximum seen.
    const refunded = requested > current.refundedMinor ? requested : current.refundedMinor;
    await tx.conversion.update({ where: { id: conv.id }, data: { refundedMinor: refunded } });
    const full = total === 0n || refunded >= total;
    await this.setStatus(tx, current, full ? 'refunded' : 'partially_refunded');
    const updated = await tx.conversion.findUniqueOrThrow({ where: { id: conv.id } });
    await this.commissions.applyRefund(tx, updated, refunded, full ? 'order_refunded' : 'order_partially_refunded');
  }

  /** Replay cancel/refund events that arrived before the order itself. */
  private async replayParked(tx: TransactionClient, conv: Conversion, input: IngestInput): Promise<void> {
    const parked = await tx.conversionEvent.findMany({
      where: { businessId: input.businessId, source: input.sourceSystem, conversionId: null, processingNote: 'awaiting_conversion', payloadJson: { path: ['externalRef'], equals: conv.externalRef } },
      orderBy: { occurredAt: 'asc' },
    });
    for (const ev of parked) {
      const payload = ev.payloadJson as Record<string, unknown>;
      const refunded = payload.refundedTotalMinor != null ? BigInt(payload.refundedTotalMinor as number | string) : null;
      if (ev.eventType === 'ORDER_CANCELLED') await this.cancel(tx, conv, 'order_cancelled');
      else if (ev.eventType === 'ORDER_REFUNDED') await this.refund(tx, conv, refunded);
      await tx.conversionEvent.update({ where: { id: ev.id }, data: { conversionId: conv.id, processingState: 'processed', processingNote: 'replayed_after_conversion' } });
    }
  }

  /** Apply a state transition only if the lifecycle allows it (tolerant of out-of-order events). */
  private async setStatus(tx: TransactionClient, conv: Pick<Conversion, 'id' | 'status'>, to: ConversionStatus): Promise<boolean> {
    const current = (await tx.conversion.findUniqueOrThrow({ where: { id: conv.id }, select: { status: true } })).status;
    if (current === to) return true;
    if (!canTransition(ConversionMachine, current as DomainConversionStatus, to as DomainConversionStatus)) {
      this.logger.debug({ conversionId: conv.id, from: current, to }, 'conversion transition skipped');
      return false;
    }
    await tx.conversion.update({ where: { id: conv.id }, data: { status: to, version: { increment: 1 } } });
    return true;
  }
}
