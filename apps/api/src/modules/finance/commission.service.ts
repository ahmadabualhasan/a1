import { Inject, Injectable, Logger } from '@nestjs/common';
import type { CommissionCalculation, Conversion, PrismaClient, TransactionClient } from '@codek/database';
import {
  assertTransition,
  CommissionMachine,
  computeCommission,
  computePlatformFee,
  DomainError,
  Postings,
  recalculateAfterRefund,
  type CommissionRuleSnapshot,
  type CommissionStatus,
  type ConversionAmounts,
  type ConversionLineItem,
  type FeePlan,
} from '@codek/domain';
import { PRISMA } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { OutboxService } from '../../outbox/outbox.service';
import { toJsonSafe } from '../../common/json';
import { LedgerService } from './ledger.service';

/** Snapshot JSON stores bigints as numbers/strings; rebuild the typed domain rule. */
export function ruleFromSnapshot(json: unknown): CommissionRuleSnapshot {
  const r = json as Record<string, unknown>;
  const big = (v: unknown) => (v == null ? null : BigInt(v as string | number));
  return {
    ruleId: r.ruleId as string,
    version: Number(r.version),
    type: r.type as CommissionRuleSnapshot['type'],
    rate: (r.rate as string | null) ?? null,
    fixedMinor: big(r.fixedMinor),
    baseType: r.baseType as CommissionRuleSnapshot['baseType'],
    includeTax: !!r.includeTax,
    includeShipping: !!r.includeShipping,
    excludedItems: (r.excludedItems as CommissionRuleSnapshot['excludedItems']) ?? null,
    minMinor: big(r.minMinor),
    maxMinor: big(r.maxMinor),
    currency: (r.currency as string | null) ?? null,
    roundingMode: r.roundingMode as CommissionRuleSnapshot['roundingMode'],
    refundBehavior: r.refundBehavior as CommissionRuleSnapshot['refundBehavior'],
  };
}

export function amountsOf(c: Conversion): ConversionAmounts {
  const items = (c.lineItems as Array<Record<string, unknown>> | null) ?? null;
  return {
    currency: c.currency!,
    grossMinor: c.grossMinor ?? 0n,
    discountMinor: c.discountMinor ?? 0n,
    taxMinor: c.taxMinor ?? 0n,
    shippingMinor: c.shippingFeeMinor ?? 0n,
    otherFeeMinor: c.otherFeeMinor ?? 0n,
    netMinor: c.netMinor,
    lineItems: items?.map(
      (li): ConversionLineItem => ({
        sku: (li.sku as string) ?? null,
        productId: (li.productId as string) ?? null,
        category: (li.category as string) ?? null,
        quantity: Number(li.quantity ?? 1),
        grossMinor: BigInt(li.grossMinor as string | number),
        discountMinor: li.discountMinor != null ? BigInt(li.discountMinor as string | number) : null,
      }),
    ),
  };
}

const effective = (c: CommissionCalculation) => c.commissionMinor - c.reversedMinor - c.clawbackMinor;
const effectiveFee = (c: CommissionCalculation) => c.feeMinor - c.feeReversedMinor;

/**
 * Commission lifecycle (spec §8.3): Pending → Approved → Funded → Available → Payout Requested → Processing → Paid,
 * plus Reversed / Clawback. Every monetary step posts a balanced, idempotent ledger entry in the same transaction.
 */
@Injectable()
export class CommissionService {
  private readonly logger = new Logger('CommissionService');

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly ledger: LedgerService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
  ) {}

  /** Calculate from the partnership's frozen snapshot. Returns null (and a review reason) when it cannot be computed safely. */
  async calculate(tx: TransactionClient, conversion: Conversion, partnershipId: string): Promise<{ calc: CommissionCalculation | null; reviewReason?: string }> {
    const existing = await tx.commissionCalculation.findUnique({ where: { conversionId: conversion.id } });
    if (existing) return { calc: existing };
    const partnership = await tx.partnership.findUniqueOrThrow({ where: { id: partnershipId } });
    if (!partnership.termsSnapshotId) return { calc: null, reviewReason: 'NO_TERMS_SNAPSHOT' };
    const snap = await tx.partnershipTermsSnapshot.findUniqueOrThrow({ where: { id: partnership.termsSnapshotId } });
    if (!conversion.currency || conversion.grossMinor == null) return { calc: null, reviewReason: 'MISSING_AMOUNTS' };
    const rule = ruleFromSnapshot(snap.commissionConfig);
    const feePlan = snap.feePlanJson as unknown as FeePlan;
    let result;
    try {
      result = computeCommission(rule, amountsOf(conversion));
    } catch (e) {
      if (e instanceof DomainError) return { calc: null, reviewReason: (e.details.reason as string) ?? e.code };
      throw e;
    }
    const fee = computePlatformFee(feePlan, { commissionMinor: result.commissionMinor, saleBaseMinor: result.baseMinor });
    const holdUntil = new Date(conversion.occurredAt.getTime() + snap.holdPeriodDays * 86400000);
    const calc = await tx.commissionCalculation.create({
      data: {
        conversionId: conversion.id,
        businessId: conversion.businessId,
        creatorId: partnership.creatorId,
        partnershipId,
        termsSnapshotId: snap.id,
        commissionRuleId: rule.ruleId,
        commissionRuleVersion: rule.version,
        ruleSnapshot: snap.commissionConfig as object,
        baseMinor: result.baseMinor,
        rate: rule.type === 'percentage' ? rule.rate : null,
        fixedMinor: rule.type === 'fixed' ? rule.fixedMinor : null,
        commissionMinor: result.commissionMinor,
        feeMinor: fee,
        feePlanSnapshot: snap.feePlanJson as object,
        currency: result.currency,
        status: 'pending',
        trace: toJsonSafe(result.trace) as object,
        holdUntil,
      },
    });
    const parties = { businessId: conversion.businessId, creatorId: partnership.creatorId, currency: calc.currency };
    if (calc.commissionMinor + calc.feeMinor > 0n) {
      await this.ledger.post(tx, Postings.commissionAccrued(parties, calc.commissionMinor, calc.feeMinor), {
        businessId: calc.businessId,
        referenceType: 'commission_calculation',
        referenceId: calc.id,
        idempotencyKey: `commission:${calc.id}:accrued`,
        description: 'Commission accrued (pending)',
      });
    }
    await conversionCommissionable(tx, conversion.id, result.baseMinor);
    await this.outbox.enqueue(tx, { eventType: 'CommissionCalculated', aggregateType: 'commission_calculation', aggregateId: calc.id, businessId: calc.businessId, payload: { commissionId: calc.id, conversionId: conversion.id, creatorId: calc.creatorId, commissionMinor: calc.commissionMinor, currency: calc.currency } });
    return { calc };
  }

  async approve(tx: TransactionClient, calcId: string, actorUserId: string | null, reason: string): Promise<CommissionCalculation> {
    const calc = await this.lock(tx, calcId);
    if (calc.status !== 'pending') return calc;
    assertTransition(CommissionMachine, 'pending', 'approved');
    const amount = effective(calc);
    const fee = effectiveFee(calc);
    if (amount + fee > 0n) {
      await this.ledger.post(tx, Postings.commissionApproved(this.parties(calc), amount, fee), {
        businessId: calc.businessId,
        referenceType: 'commission_calculation',
        referenceId: calc.id,
        idempotencyKey: `commission:${calc.id}:approved`,
        description: 'Commission approved',
        createdBy: actorUserId,
      });
    }
    const updated = await tx.commissionCalculation.update({ where: { id: calc.id }, data: { status: 'approved', approvedAt: new Date(), version: { increment: 1 } } });
    await this.audit.record({ actorUserId, actorType: actorUserId ? 'user' : 'system', businessId: calc.businessId, action: 'commission.approved', objectType: 'commission_calculation', objectId: calc.id, reason }, tx);
    await this.outbox.enqueue(tx, { eventType: 'CommissionApproved', aggregateType: 'commission_calculation', aggregateId: calc.id, businessId: calc.businessId, payload: { commissionId: calc.id, creatorId: calc.creatorId, commissionMinor: amount, currency: calc.currency } });
    await tx.partnershipEvent.create({ data: { partnershipId: calc.partnershipId, eventType: 'commission_approved', data: toJsonSafe({ commissionId: calc.id, amountMinor: amount, currency: calc.currency }) as object } });
    return updated;
  }

  /** Allocate merchant funding FIFO to approved commissions of one business+currency (D-018). */
  async allocateFunding(tx: TransactionClient, businessId: string, currency: string): Promise<number> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`funding:${businessId}:${currency}`}))`;
    let available = await this.ledger.balance(tx, { accountType: 'merchant_funding', ownerId: businessId, currency });
    const candidates = await tx.commissionCalculation.findMany({ where: { businessId, currency, status: 'approved' }, orderBy: [{ approvedAt: 'asc' }, { id: 'asc' }] });
    let funded = 0;
    for (const c of candidates) {
      const need = effective(c) + effectiveFee(c);
      if (need > available) break; // strict FIFO: never skip an older obligation
      if (need > 0n) {
        await this.ledger.post(tx, Postings.commissionFunded(this.parties(c), effective(c), effectiveFee(c)), {
          businessId,
          referenceType: 'commission_calculation',
          referenceId: c.id,
          idempotencyKey: `commission:${c.id}:funded`,
          description: 'Commission funded from merchant funding',
        });
        available -= need;
      }
      await tx.commissionCalculation.update({ where: { id: c.id }, data: { status: 'funded', fundedAt: new Date(), version: { increment: 1 } } });
      funded++;
    }
    return funded;
  }

  /** Funded + hold elapsed + not on hold → Available (payout-eligible obligation; not custody, spec §4.6). */
  async releaseDue(tx: TransactionClient, now: Date, filter: { businessId?: string; creatorId?: string } = {}): Promise<number> {
    const due = await tx.commissionCalculation.findMany({ where: { status: 'funded', onHold: false, holdUntil: { lte: now }, ...filter }, orderBy: { holdUntil: 'asc' }, take: 500 });
    for (const c of due) {
      const amount = effective(c);
      if (amount > 0n) {
        await this.ledger.post(tx, Postings.commissionReleased(this.parties(c), amount), {
          businessId: c.businessId,
          referenceType: 'commission_calculation',
          referenceId: c.id,
          idempotencyKey: `commission:${c.id}:released`,
          description: 'Commission available for payout',
        });
      }
      await tx.commissionCalculation.update({ where: { id: c.id }, data: { status: 'available', availableAt: now, version: { increment: 1 } } });
    }
    return due.length;
  }

  /**
   * Apply a refund/cancellation: recompute the commission that should remain and reverse/claw back the difference
   * according to the snapshotted refund behaviour (D-008). History is never edited; new entries are appended.
   */
  async applyRefund(tx: TransactionClient, conversion: Conversion, cumulativeRefundedMinor: bigint, reason: string): Promise<CommissionCalculation | null> {
    const found = await tx.commissionCalculation.findUnique({ where: { conversionId: conversion.id } });
    if (!found) return null;
    const calc = await this.lock(tx, found.id);
    if (calc.status === 'reversed' || calc.status === 'clawback') return calc;
    const rule = ruleFromSnapshot(calc.ruleSnapshot);
    const recalc = recalculateAfterRefund(rule, amountsOf(conversion), calc.commissionMinor, cumulativeRefundedMinor);
    const delta = effective(calc) - recalc.remainingCommissionMinor;
    if (delta <= 0n) return calc;
    const feePlan = calc.feePlanSnapshot as unknown as FeePlan;
    const remainingFee = recalc.remainingCommissionMinor === 0n ? 0n : computePlatformFee(feePlan, { commissionMinor: recalc.remainingCommissionMinor, saleBaseMinor: calc.baseMinor });
    const feeDelta = effectiveFee(calc) > remainingFee ? effectiveFee(calc) - remainingFee : 0n;
    const status = calc.status as CommissionStatus;
    const seq = (await tx.ledgerEntry.count({ where: { referenceType: 'commission_calculation', referenceId: calc.id, entryType: { in: ['commission_reversed', 'commission_clawback'] } } })) + 1;
    const meta = { businessId: calc.businessId, referenceType: 'commission_calculation', referenceId: calc.id, description: reason };
    const fullyGone = recalc.remainingCommissionMinor === 0n;
    let data: Record<string, unknown>;
    if (status === 'pending' || status === 'approved' || status === 'funded' || status === 'available') {
      await this.ledger.post(tx, Postings.commissionReversed(this.parties(calc), status, delta, feeDelta), { ...meta, idempotencyKey: `commission:${calc.id}:reversal:${seq}` });
      data = { reversedMinor: { increment: delta }, feeReversedMinor: { increment: feeDelta }, ...(fullyGone ? { status: 'reversed' } : {}) };
    } else if (rule.refundBehavior === 'clawback') {
      // Paid or in-flight payout: recover from the creator's future earnings.
      await this.ledger.post(tx, Postings.commissionClawback(this.parties(calc), delta, feeDelta), { ...meta, idempotencyKey: `commission:${calc.id}:clawback:${seq}` });
      data = { clawbackMinor: { increment: delta }, feeReversedMinor: { increment: feeDelta }, ...(fullyGone && status === 'paid' ? { status: 'clawback' } : {}) };
    } else {
      await this.audit.record({ actorType: 'system', businessId: calc.businessId, action: 'commission.reversal_not_applicable_after_payout', objectType: 'commission_calculation', objectId: calc.id, reason, after: { deltaMinor: delta } }, tx);
      return calc;
    }
    const updated = await tx.commissionCalculation.update({ where: { id: calc.id }, data: { ...data, version: { increment: 1 } } });
    await this.audit.record({ actorType: 'system', businessId: calc.businessId, action: 'commission.reversed', objectType: 'commission_calculation', objectId: calc.id, reason, before: { status, effectiveMinor: effective(calc) }, after: { status: updated.status, effectiveMinor: effective(updated) } }, tx);
    await this.outbox.enqueue(tx, { eventType: 'CommissionReversed', aggregateType: 'commission_calculation', aggregateId: calc.id, businessId: calc.businessId, payload: { commissionId: calc.id, creatorId: calc.creatorId, reversedMinor: delta, currency: calc.currency, stage: status } });
    return updated;
  }

  async setHold(tx: TransactionClient, calcId: string, onHold: boolean, reason: string, actorUserId: string | null): Promise<void> {
    await tx.commissionCalculation.update({ where: { id: calcId }, data: { onHold, holdReason: onHold ? reason : null } });
    const c = await tx.commissionCalculation.findUniqueOrThrow({ where: { id: calcId } });
    await this.audit.record({ actorUserId, businessId: c.businessId, action: onHold ? 'commission.hold_placed' : 'commission.hold_released', objectType: 'commission_calculation', objectId: calcId, reason }, tx);
  }

  private parties(c: CommissionCalculation) {
    return { businessId: c.businessId, creatorId: c.creatorId, currency: c.currency };
  }

  private async lock(tx: TransactionClient, id: string): Promise<CommissionCalculation> {
    await tx.$queryRaw`SELECT id FROM commission_calculations WHERE id = ${id}::uuid FOR UPDATE`;
    return tx.commissionCalculation.findUniqueOrThrow({ where: { id } });
  }
}

async function conversionCommissionable(tx: TransactionClient, id: string, base: bigint) {
  await tx.conversion.update({ where: { id }, data: { commissionableMinor: base } });
}
