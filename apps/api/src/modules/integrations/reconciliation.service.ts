import { Inject, Injectable } from '@nestjs/common';
import type { Prisma, PrismaClient, ReconciliationItemStatus } from '@codek/database';
import { normalizeCode } from '@codek/domain';
import { PRISMA } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { ApiError, notFound } from '../../common/errors';
import { LedgerService } from '../finance/ledger.service';
import type { ExternalOrderSummary } from './adapters/adapter.types';
import { AdapterRegistry } from './adapters/registry';
import { IntegrationsService } from './integrations.service';

type Item = Omit<Prisma.ReconciliationItemCreateManyInput, 'reconciliationId'>;

/**
 * Reconciliation (spec §10.6, §11.7): CODEK ledger ↔ provider ↔ merchant source ↔ payouts.
 * Detects missing, duplicate, late and mismatched records. Never repairs by overwriting history — findings are
 * resolved through explicit, audited actions (replay, adjustment request, accepted difference).
 */
@Injectable()
export class ReconciliationService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly registry: AdapterRegistry,
    private readonly integrations: IntegrationsService,
    private readonly ledger: LedgerService,
    private readonly audit: AuditService,
  ) {}

  async runIntegration(integrationId: string, scopeStart: Date, scopeEnd: Date, actorUserId: string | null, statement?: ExternalOrderSummary[]) {
    const integration = await this.prisma.integration.findUnique({ where: { id: integrationId } });
    if (!integration) throw notFound('Integration');
    const recon = await this.prisma.reconciliation.create({ data: { integrationId, kind: 'integration_orders', scopeStart, scopeEnd, status: 'running', triggeredBy: actorUserId } });
    try {
      let external = statement;
      if (!external) {
        const adapter = this.registry.get(integration.provider)!;
        if (!adapter.fetchOrders) throw new ApiError('UNSUPPORTED_CONFIGURATION', 'This integration cannot pull orders; upload a statement instead');
        external = await adapter.fetchOrders((integration.config ?? {}) as Record<string, unknown>, await this.integrations.loadSecrets(integrationId), scopeStart, scopeEnd);
      }
      const codes = new Set((await this.prisma.promotionCode.findMany({ where: { businessId: integration.businessId }, select: { normalizedCode: true } })).map((c) => c.normalizedCode));
      const local = await this.prisma.conversion.findMany({ where: { businessId: integration.businessId, sourceSystem: integration.provider, occurredAt: { gte: scopeStart, lte: scopeEnd } }, include: { events: { orderBy: { receivedAt: 'asc' }, take: 1 } } });
      const localByRef = new Map(local.map((c) => [c.externalRef, c]));
      const items: Item[] = [];
      const seenExternal = new Set<string>();
      for (const o of external) {
        if (seenExternal.has(o.externalRef)) {
          items.push({ entityType: 'external_order', externalRef: o.externalRef, status: 'duplicate', notes: 'Order appears more than once in the provider data' });
          continue;
        }
        seenExternal.add(o.externalRef);
        const relevant = !!o.referralClickId || o.discountCodes.some((c) => codes.has(normalizeCode(c)));
        const conv = localByRef.get(o.externalRef);
        if (!conv) {
          if (relevant) items.push({ entityType: 'conversion', externalRef: o.externalRef, externalAmountMinor: o.grossMinor, currency: o.currency, status: 'missing_local', notes: 'Provider order with CODEK code/link has no CODEK conversion' });
          continue;
        }
        const diff = (conv.grossMinor ?? 0n) - o.grossMinor;
        if (diff !== 0n || conv.currency !== o.currency) {
          items.push({ entityType: 'conversion', entityId: conv.id, externalRef: o.externalRef, localAmountMinor: conv.grossMinor, externalAmountMinor: o.grossMinor, currency: o.currency, differenceMinor: diff, status: 'mismatch', notes: conv.currency !== o.currency ? 'Currency differs' : 'Amount differs' });
        } else if (o.cancelled && !['cancelled', 'refunded', 'reversed', 'rejected'].includes(conv.status)) {
          items.push({ entityType: 'conversion', entityId: conv.id, externalRef: o.externalRef, localAmountMinor: conv.grossMinor, externalAmountMinor: o.grossMinor, currency: o.currency, status: 'mismatch', notes: 'Cancelled at provider but not in CODEK' });
        } else {
          const first = conv.events[0];
          const late = first && first.receivedAt.getTime() - conv.occurredAt.getTime() > 24 * 3600 * 1000;
          items.push({ entityType: 'conversion', entityId: conv.id, externalRef: o.externalRef, localAmountMinor: conv.grossMinor, externalAmountMinor: o.grossMinor, currency: o.currency, differenceMinor: 0n, status: late ? 'late' : 'matched', notes: late ? 'Event arrived more than 24h after the order' : null });
        }
      }
      for (const c of local) {
        if (!seenExternal.has(c.externalRef)) items.push({ entityType: 'conversion', entityId: c.id, externalRef: c.externalRef, localAmountMinor: c.grossMinor, currency: c.currency, status: 'missing_external', notes: 'CODEK conversion not found at the provider' });
      }
      return this.finish(recon.id, items, { externalOrders: external.length, localConversions: local.length }, actorUserId, integration.businessId);
    } catch (e) {
      await this.prisma.reconciliation.update({ where: { id: recon.id }, data: { status: 'failed', completedAt: new Date(), summaryJson: { error: (e as Error).message.slice(0, 300) } } });
      throw e;
    }
  }

  /** Internal ledger ↔ commissions ↔ payouts consistency (runs nightly and on demand). */
  async runLedger(actorUserId: string | null) {
    const now = new Date();
    const recon = await this.prisma.reconciliation.create({ data: { kind: 'ledger_internal', scopeStart: new Date(0), scopeEnd: now, status: 'running', triggeredBy: actorUserId } });
    const items: Item[] = [];
    const inv = await this.ledger.verifyInvariants();
    if (!inv.ok) items.push({ entityType: 'ledger', status: 'mismatch', notes: `Unbalanced entries: ${inv.unbalancedEntries}; currency imbalances: ${inv.currencyImbalances.map((c) => `${c.currency} ${c.diff}`).join(', ')}` });
    // Commission states vs creator ledger accounts.
    const byCreator = await this.prisma.commissionCalculation.groupBy({ by: ['creatorId', 'currency', 'status'], _sum: { commissionMinor: true, reversedMinor: true, clawbackMinor: true } });
    const expected = new Map<string, { pending: bigint; payable: bigint; available: bigint }>();
    for (const g of byCreator) {
      const k = `${g.creatorId}:${g.currency}`;
      const e = expected.get(k) ?? { pending: 0n, payable: 0n, available: 0n };
      const eff = (g._sum.commissionMinor ?? 0n) - (g._sum.reversedMinor ?? 0n) - (g._sum.clawbackMinor ?? 0n);
      if (g.status === 'pending') e.pending += eff;
      if (g.status === 'approved' || g.status === 'funded') e.payable += eff;
      if (g.status === 'available') e.available += eff;
      expected.set(k, e);
    }
    for (const [k, e] of expected) {
      const [creatorId, currency] = k.split(':') as [string, string];
      const checks: Array<[string, bigint, bigint]> = [
        ['creator_pending', e.pending, await this.ledger.balance(this.prisma, { accountType: 'creator_pending', ownerId: creatorId, currency })],
        ['creator_payable', e.payable, await this.ledger.balance(this.prisma, { accountType: 'creator_payable', ownerId: creatorId, currency })],
      ];
      for (const [acct, exp, actual] of checks) {
        items.push({ entityType: acct, entityId: creatorId, localAmountMinor: actual, externalAmountMinor: exp, currency, differenceMinor: actual - exp, status: actual === exp ? 'matched' : 'mismatch', notes: actual === exp ? null : `Ledger ${acct} differs from commission records` });
      }
    }
    // Payouts ↔ provider transactions.
    const paid = await this.prisma.payout.findMany({ where: { status: 'paid' }, include: { providerTransaction: true } });
    for (const p of paid) {
      const ok = !!p.providerTransaction && p.providerTransaction.amountMinor === p.amountMinor && p.providerTransaction.currency === p.currency;
      items.push({ entityType: 'payout', entityId: p.id, externalRef: p.providerTransaction?.providerTransactionId ?? null, localAmountMinor: p.amountMinor, externalAmountMinor: p.providerTransaction?.amountMinor ?? null, currency: p.currency, status: ok ? 'matched' : p.providerTransaction ? 'mismatch' : 'missing_external' });
    }
    return this.finish(recon.id, items, { ledgerOk: inv.ok, creatorsChecked: expected.size, payoutsChecked: paid.length }, actorUserId, null);
  }

  private async finish(reconciliationId: string, items: Item[], extra: Record<string, unknown>, actorUserId: string | null, businessId: string | null) {
    if (items.length) await this.prisma.reconciliationItem.createMany({ data: items.map((i) => ({ ...i, reconciliationId })) });
    const counts: Record<string, number> = {};
    for (const i of items) counts[i.status as string] = (counts[i.status as string] ?? 0) + 1;
    const needsReview = items.some((i) => i.status !== 'matched');
    const done = await this.prisma.reconciliation.update({ where: { id: reconciliationId }, data: { status: needsReview ? 'needs_review' : 'completed', completedAt: new Date(), summaryJson: { ...extra, counts } } });
    await this.audit.record({ actorUserId, actorType: actorUserId ? 'user' : 'system', businessId, action: 'reconciliation.completed', objectType: 'reconciliation', objectId: reconciliationId, after: { status: done.status, counts } });
    return done;
  }

  async get(id: string) {
    const r = await this.prisma.reconciliation.findUnique({ where: { id }, include: { items: { orderBy: { status: 'asc' } } } });
    if (!r) throw notFound('Reconciliation');
    return r;
  }

  async resolveItem(itemId: string, resolution: 'accepted_difference' | 'event_replayed' | 'adjustment_requested' | 'false_positive', note: string, actorUserId: string) {
    const item = await this.prisma.reconciliationItem.findUnique({ where: { id: itemId } });
    if (!item) throw notFound('Reconciliation item');
    if (item.resolvedAt) throw new ApiError('CONFLICT', 'Already resolved');
    const updated = await this.prisma.reconciliationItem.update({ where: { id: itemId }, data: { resolution: `${resolution}: ${note}`.slice(0, 1000), resolvedBy: actorUserId, resolvedAt: new Date() } });
    await this.audit.record({ actorUserId, action: 'reconciliation.item_resolved', objectType: 'reconciliation_item', objectId: itemId, reason: note, after: { resolution, status: item.status as ReconciliationItemStatus } });
    return updated;
  }
}
