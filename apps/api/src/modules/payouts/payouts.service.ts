import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Payout, PrismaClient, TransactionClient } from '@codek/database';
import { assertTransition, Postings, PayoutMachine, type PayoutStatus } from '@codek/domain';
import type { Env } from '@codek/config';
import { ENV } from '../../config/config.module';
import { PRISMA } from '../../prisma/prisma.service';
import { AccessService } from '../../access/access.service';
import { AuditService } from '../../audit/audit.service';
import { OutboxService } from '../../outbox/outbox.service';
import { SettingsService } from '../../settings/settings.service';
import { QueueService } from '../../queue/queue.service';
import { QUEUES } from '../../queue/queues';
import { ApiError, notFound, ruleViolation } from '../../common/errors';
import { page, type Pagination } from '../../common/pagination';
import type { Principal } from '../../auth/principal';
import { LedgerService } from '../finance/ledger.service';
import { PAYOUT_PROVIDER } from '../../payments/payments.module';
import type { PayoutProvider, PayoutRecipient } from '../../payments/provider.types';

export const MAX_PAYOUT_ATTEMPTS = 5;

/**
 * Creator payouts (spec §10.5). The payout-eligible amount is derived from the ledger (creator_available net of
 * clawbacks) and from whole available commissions (D-016). Attempts are append-only history; failed attempts are
 * never deleted. Retries use exponential backoff via the payout-processing queue.
 */
@Injectable()
export class PayoutsService {
  private readonly logger = new Logger('PayoutsService');

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(ENV) private readonly env: Env,
    @Inject(PAYOUT_PROVIDER) private readonly provider: PayoutProvider,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly settings: SettingsService,
    private readonly ledger: LedgerService,
    private readonly queues: QueueService,
  ) {}

  // ─────────────── Creator views ───────────────

  async earnings(p: Principal) {
    const creatorId = this.access.creatorId(p, 'creator.earnings.read');
    const balances = await this.ledger.ownerBalances(this.prisma, 'creator', creatorId);
    const paid = await this.prisma.payout.groupBy({ by: ['currency'], where: { creatorId, status: 'paid' }, _sum: { amountMinor: true } });
    const inFlight = await this.prisma.payout.groupBy({ by: ['currency'], where: { creatorId, status: { in: ['requested', 'processing'] } }, _sum: { amountMinor: true } });
    const currencies = new Set([...balances.map((b) => b.currency), ...paid.map((x) => x.currency)]);
    return {
      currencies: [...currencies].map((currency) => {
        const bal = (t: string) => balances.find((b) => b.currency === currency && b.accountType === t)?.balanceMinor ?? 0n;
        const pending = bal('creator_pending');
        const approved = bal('creator_payable');
        const availableGross = bal('creator_available');
        const clawback = bal('creator_clawback_receivable');
        const paidMinor = paid.find((x) => x.currency === currency)?._sum.amountMinor ?? 0n;
        const inFlightMinor = inFlight.find((x) => x.currency === currency)?._sum.amountMinor ?? 0n;
        const available = availableGross - clawback > 0n ? availableGross - clawback : 0n;
        return { currency, totalMinor: pending + approved + availableGross + inFlightMinor + paidMinor, pendingMinor: pending, approvedMinor: approved, availableMinor: available, payoutInProgressMinor: inFlightMinor, paidMinor, clawbackOutstandingMinor: clawback };
      }),
      explanation: {
        pending: 'Sales waiting for the business to confirm payment or for approval.',
        approved: 'Approved commissions waiting for the business to fund them or for the hold period to end.',
        available: 'Amounts you can request as a payout. CODEK records what you are owed; it does not hold your money in a wallet or escrow.',
        paid: 'Payouts completed by the payout provider.',
      },
    };
  }

  async list(p: Principal, q: Pagination) {
    const creatorId = this.access.creatorId(p, 'creator.earnings.read');
    const where = { creatorId };
    const [items, total] = await Promise.all([
      this.prisma.payout.findMany({ where, include: { attempts: { orderBy: { attemptNumber: 'asc' }, select: { attemptNumber: true, status: true, errorCode: true, errorMessageSafe: true, startedAt: true, finishedAt: true } }, items: { select: { commissionCalculationId: true, amountMinor: true } } }, orderBy: { requestedAt: 'desc' }, take: q.limit, skip: q.offset }),
      this.prisma.payout.count({ where }),
    ]);
    return page(items, total, q);
  }

  async setPayoutMethod(p: Principal, method: { type: 'paypal'; email: string }) {
    const creatorId = this.access.creatorId(p, 'creator.payout.request');
    const before = await this.prisma.creator.findUniqueOrThrow({ where: { id: creatorId }, select: { payoutMethod: true, payoutReadiness: true } });
    const updated = await this.prisma.creator.update({ where: { id: creatorId }, data: { payoutMethod: method, payoutReadiness: before.payoutReadiness === 'restricted' ? 'restricted' : 'ready' }, select: { payoutMethod: true, payoutReadiness: true } });
    await this.audit.record({ actorUserId: p.userId, action: 'creator.payout_method_updated', objectType: 'creator', objectId: creatorId, before: { type: (before.payoutMethod as { type?: string } | null)?.type ?? null }, after: { type: method.type } });
    return updated;
  }

  // ─────────────── Request ───────────────

  async request(p: Principal, dto: { currency: string; amountMinor?: number }, idempotencyKey: string) {
    const creatorId = this.access.creatorId(p, 'creator.payout.request');
    if (!(await this.settings.flag('payouts.enabled'))) throw new ApiError('FEATURE_DISABLED', 'Payouts are temporarily unavailable');
    const creator = await this.prisma.creator.findUniqueOrThrow({ where: { id: creatorId } });
    if (creator.payoutReadiness !== 'ready' || !creator.payoutMethod) throw ruleViolation('Add a payout method before requesting a payout', { next: 'payout_method' });
    const openRisk = await this.prisma.fraudFlag.count({ where: { subjectType: 'creator', subjectId: creatorId, status: { in: ['open', 'reviewing'] }, severity: { in: ['high', 'critical'] } } });
    const openCase = await this.prisma.fraudCase.count({ where: { subjectType: 'creator', subjectId: creatorId, status: { not: 'closed' } } });
    if (openRisk || openCase) throw ruleViolation('Your account is under review. Payouts will resume once the review is complete.', { reason: 'RISK_REVIEW' });
    const minimum = await this.settings.get<Record<string, number>>('payouts.minimum_minor', { default: 0 });
    const minMinor = BigInt(minimum[dto.currency] ?? minimum.default ?? 0);

    const payout = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`payout:${creatorId}:${dto.currency}`}))`;
      const idem = `payout:${creatorId}:${idempotencyKey}`;
      const existing = await tx.payout.findUnique({ where: { idempotencyKey: idem } });
      if (existing) return existing;
      const available = await this.ledger.balance(tx, { accountType: 'creator_available', ownerId: creatorId, currency: dto.currency });
      const clawback = await this.ledger.balance(tx, { accountType: 'creator_clawback_receivable', ownerId: creatorId, currency: dto.currency });
      const candidates = await tx.commissionCalculation.findMany({ where: { creatorId, currency: dto.currency, status: 'available', onHold: false }, orderBy: [{ availableAt: 'asc' }, { id: 'asc' }] });
      const limit = dto.amountMinor != null ? BigInt(dto.amountMinor) : null;
      const selected: Array<{ id: string; amount: bigint }> = [];
      let gross = 0n;
      for (const c of candidates) {
        const amt = c.commissionMinor - c.reversedMinor - c.clawbackMinor;
        if (amt <= 0n) continue;
        const netAfter = gross + amt - (clawback < gross + amt ? clawback : gross + amt);
        if (limit != null && netAfter > limit) break;
        selected.push({ id: c.id, amount: amt });
        gross += amt;
      }
      if (gross > available) throw new ApiError('INSUFFICIENT_BALANCE', 'Available balance changed, please try again');
      const netting = clawback < gross ? clawback : gross;
      const amount = gross - netting;
      if (amount <= 0n) throw ruleViolation('There is no available balance to pay out', { availableMinor: available - clawback > 0n ? available - clawback : 0n });
      if (amount < minMinor) throw ruleViolation('The amount is below the minimum payout', { minimumMinor: minMinor });
      const created = await tx.payout.create({
        data: { creatorId, amountMinor: amount, currency: dto.currency, status: 'requested', provider: this.provider.name, payoutMethodSnapshot: creator.payoutMethod as object, idempotencyKey: idem },
      });
      if (netting > 0n) {
        await this.ledger.post(tx, Postings.clawbackNetted(creatorId, dto.currency, netting), { referenceType: 'payout', referenceId: created.id, idempotencyKey: `payout:${created.id}:clawback_netted`, description: 'Outstanding clawback netted against payout' });
      }
      await this.ledger.post(tx, Postings.payoutRequested(creatorId, dto.currency, amount), { referenceType: 'payout', referenceId: created.id, idempotencyKey: `payout:${created.id}:requested`, description: 'Payout requested', createdBy: p.userId });
      for (const s of selected) {
        const r = await tx.commissionCalculation.updateMany({ where: { id: s.id, status: 'available' }, data: { status: 'payout_requested', version: { increment: 1 } } });
        if (r.count === 0) throw new ApiError('VERSION_CONFLICT', 'Commission state changed, please retry');
        await tx.payoutItem.create({ data: { payoutId: created.id, commissionCalculationId: s.id, amountMinor: s.amount } });
      }
      await this.audit.record({ actorUserId: p.userId, action: 'payout.requested', objectType: 'payout', objectId: created.id, after: { amountMinor: amount, currency: dto.currency, nettedClawbackMinor: netting, commissions: selected.length } }, tx);
      await this.outbox.enqueue(tx, { eventType: 'PayoutRequested', aggregateType: 'payout', aggregateId: created.id, payload: { payoutId: created.id, creatorId, amountMinor: amount, currency: dto.currency } });
      return created;
    });
    await this.queues.add(QUEUES.payoutProcessing, 'process', { payoutId: payout.id }, { jobId: `payout-${payout.id}-1` });
    return payout;
  }

  // ─────────────── Processing (worker) ───────────────

  /** Execute one provider attempt. Safe to call repeatedly (terminal states are no-ops). */
  async process(payoutId: string): Promise<{ status: PayoutStatus; retryInMs?: number }> {
    const claim = await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ status: string }>>`SELECT status FROM payouts WHERE id = ${payoutId}::uuid FOR UPDATE`;
      const status = rows[0]?.status as PayoutStatus | undefined;
      if (!status) throw notFound('Payout');
      if (status !== 'requested' && status !== 'processing') return null;
      const last = await tx.payoutAttempt.findFirst({ where: { payoutId }, orderBy: { attemptNumber: 'desc' } });
      if (last && (last.status === 'processing' || last.status === 'pending')) return { poll: true as const, attempt: last };
      if (status === 'requested') {
        assertTransition(PayoutMachine, 'requested', 'processing');
        await tx.payout.update({ where: { id: payoutId }, data: { status: 'processing', version: { increment: 1 } } });
        await tx.commissionCalculation.updateMany({ where: { payoutItems: { some: { payoutId } }, status: 'payout_requested' }, data: { status: 'processing' } });
      }
      const attempt = await tx.payoutAttempt.create({ data: { payoutId, attemptNumber: (last?.attemptNumber ?? 0) + 1, provider: this.provider.name, status: 'processing' } });
      return { poll: false as const, attempt };
    });
    if (!claim) return { status: (await this.prisma.payout.findUniqueOrThrow({ where: { id: payoutId } })).status as PayoutStatus };
    const payout = await this.prisma.payout.findUniqueOrThrow({ where: { id: payoutId } });
    const outcome = claim.poll && claim.attempt.providerReference
      ? await this.provider.getPayoutStatus(claim.attempt.providerReference)
      : await this.provider.createPayout({
          payoutId,
          attemptNumber: claim.attempt.attemptNumber,
          amountMinor: payout.amountMinor,
          currency: payout.currency,
          recipient: payout.payoutMethodSnapshot as unknown as PayoutRecipient,
          idempotencyKey: `codek-payout-${payoutId}-${claim.attempt.attemptNumber}`,
        });
    return this.prisma.$transaction(async (tx) => {
      if (outcome.status === 'processing') {
        await tx.payoutAttempt.update({ where: { id: claim.attempt.id }, data: { providerReference: outcome.providerReference } });
        return { status: 'processing' as PayoutStatus, retryInMs: 60_000 };
      }
      if (outcome.status === 'success') {
        await tx.payoutAttempt.update({ where: { id: claim.attempt.id }, data: { status: 'success', providerReference: outcome.providerReference, finishedAt: new Date() } });
        await this.markPaid(tx, payout, outcome.providerReference);
        return { status: 'paid' as PayoutStatus };
      }
      await tx.payoutAttempt.update({ where: { id: claim.attempt.id }, data: { status: 'failed', providerReference: outcome.providerReference, errorCode: outcome.errorCode, errorMessageSafe: outcome.errorMessageSafe, finishedAt: new Date() } });
      if (outcome.retryable && claim.attempt.attemptNumber < MAX_PAYOUT_ATTEMPTS) {
        await this.audit.record({ actorType: 'system', action: 'payout.attempt_failed', objectType: 'payout', objectId: payoutId, reason: outcome.errorCode, after: { attempt: claim.attempt.attemptNumber, willRetry: true } }, tx);
        return { status: 'processing' as PayoutStatus, retryInMs: 2 ** claim.attempt.attemptNumber * 30_000 };
      }
      await this.markFailed(tx, payout, outcome.errorCode);
      return { status: 'failed' as PayoutStatus };
    });
  }

  private async markPaid(tx: TransactionClient, payout: Payout, providerReference: string): Promise<void> {
    const env = this.provider.environment;
    const ptx = await tx.paymentProviderTransaction.upsert({
      where: { provider_environment_providerTransactionId: { provider: this.provider.name, environment: env, providerTransactionId: providerReference } },
      update: { status: 'succeeded' },
      create: { provider: this.provider.name, environment: env, providerTransactionId: providerReference, transactionType: 'creator_payout', status: 'succeeded', amountMinor: payout.amountMinor, currency: payout.currency, relatedEntityType: 'payout', relatedEntityId: payout.id, occurredAt: new Date() },
    });
    await this.ledger.post(tx, Postings.payoutPaid(payout.currency, payout.amountMinor), { referenceType: 'payout', referenceId: payout.id, idempotencyKey: `payout:${payout.id}:paid`, description: `Payout completed (${this.provider.name} ${providerReference})`, metadata: { providerReference } });
    await tx.payout.update({ where: { id: payout.id }, data: { status: 'paid', processedAt: new Date(), providerTransactionId: ptx.id, version: { increment: 1 } } });
    const items = await tx.payoutItem.findMany({ where: { payoutId: payout.id } });
    const now = new Date();
    for (const it of items) {
      await tx.commissionCalculation.update({ where: { id: it.commissionCalculationId }, data: { status: 'paid', paidAt: now } });
      const c = await tx.commissionCalculation.findUniqueOrThrow({ where: { id: it.commissionCalculationId } });
      await tx.partnershipEvent.create({ data: { partnershipId: c.partnershipId, eventType: 'payout', data: { payoutId: payout.id } } });
    }
    await this.audit.record({ actorType: 'provider', action: 'payout.paid', objectType: 'payout', objectId: payout.id, after: { providerReference, amountMinor: payout.amountMinor } }, tx);
    await this.outbox.enqueue(tx, { eventType: 'PayoutProcessed', aggregateType: 'payout', aggregateId: payout.id, payload: { payoutId: payout.id, creatorId: payout.creatorId, amountMinor: payout.amountMinor, currency: payout.currency } });
  }

  /**
   * Undo a payout request in the ledger: the net amount returns from payout clearing, and any clawback that was netted
   * against it becomes outstanding again. The creator's available balance then equals the gross of the commissions
   * that become available again, and the clawback is recovered by the next payout.
   */
  private async returnFunds(tx: TransactionClient, payout: Payout, kind: 'failed' | 'cancelled', description: string): Promise<void> {
    await this.ledger.post(tx, Postings.payoutFailed(payout.creatorId, payout.currency, payout.amountMinor), { referenceType: 'payout', referenceId: payout.id, idempotencyKey: `payout:${payout.id}:${kind}`, description });
    const netted = await tx.ledgerEntryLine.findFirst({
      where: { direction: 'credit', entry: { idempotencyKey: `payout:${payout.id}:clawback_netted` } },
      select: { amountMinor: true },
    });
    if (netted && netted.amountMinor > 0n) {
      await this.ledger.post(tx, Postings.clawbackNettingReversed(payout.creatorId, payout.currency, netted.amountMinor), { referenceType: 'payout', referenceId: payout.id, idempotencyKey: `payout:${payout.id}:clawback_netting_reversed`, description: 'Clawback netting reversed because the payout did not complete' });
    }
  }

  /** Final failure: funds return to the creator's available balance; commissions become available again. */
  private async markFailed(tx: TransactionClient, payout: Payout, errorCode: string): Promise<void> {
    await this.returnFunds(tx, payout, 'failed', `Payout failed (${errorCode})`);
    await tx.payout.update({ where: { id: payout.id }, data: { status: 'failed', failureReasonCode: errorCode, processedAt: new Date(), version: { increment: 1 } } });
    await tx.commissionCalculation.updateMany({ where: { payoutItems: { some: { payoutId: payout.id } }, status: { in: ['payout_requested', 'processing'] } }, data: { status: 'available' } });
    await this.audit.record({ actorType: 'system', action: 'payout.failed', objectType: 'payout', objectId: payout.id, reason: errorCode }, tx);
    await this.outbox.enqueue(tx, { eventType: 'PayoutFailed', aggregateType: 'payout', aggregateId: payout.id, payload: { payoutId: payout.id, creatorId: payout.creatorId, errorCode } });
  }

  /** Creator cancels a payout that has not started processing. */
  async cancel(p: Principal, payoutId: string) {
    const creatorId = this.access.creatorId(p, 'creator.payout.request');
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ status: string; creator_id: string }>>`SELECT status, creator_id FROM payouts WHERE id = ${payoutId}::uuid FOR UPDATE`;
      if (!rows[0] || rows[0].creator_id !== creatorId) throw notFound('Payout');
      assertTransition(PayoutMachine, rows[0].status as PayoutStatus, 'cancelled');
      const payout = await tx.payout.findUniqueOrThrow({ where: { id: payoutId } });
      await this.returnFunds(tx, payout, 'cancelled', 'Payout cancelled before processing');
      await tx.payout.update({ where: { id: payoutId }, data: { status: 'cancelled', version: { increment: 1 } } });
      await tx.commissionCalculation.updateMany({ where: { payoutItems: { some: { payoutId } }, status: 'payout_requested' }, data: { status: 'available' } });
      await this.audit.record({ actorUserId: p.userId, action: 'payout.cancelled', objectType: 'payout', objectId: payoutId }, tx);
      return tx.payout.findUniqueOrThrow({ where: { id: payoutId } });
    });
  }

  /** Sweeper: payouts still requested/processing are (re)queued (covers Redis outages and async provider polling). */
  async sweep(): Promise<number> {
    const stuck = await this.prisma.payout.findMany({ where: { status: { in: ['requested', 'processing'] } }, select: { id: true }, take: 200 });
    for (const s of stuck) await this.queues.add(QUEUES.payoutProcessing, 'process', { payoutId: s.id }, { jobId: `payout-${s.id}-sweep-${Math.floor(Date.now() / 60000)}` });
    return stuck.length;
  }
}
