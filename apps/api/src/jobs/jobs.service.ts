import { Inject, Injectable, Logger } from '@nestjs/common';
import type { PrismaClient } from '@codek/database';
import { PRISMA } from '../prisma/prisma.service';
import { OutboxDispatcher } from '../outbox/outbox.dispatcher';
import { CampaignsService } from '../modules/campaigns/campaigns.service';
import { PromotionService } from '../modules/promotion/promotion.service';
import { CommissionService } from '../modules/finance/commission.service';
import { LedgerService } from '../modules/finance/ledger.service';
import { WebhooksService } from '../modules/integrations/webhooks.service';
import { ReconciliationService } from '../modules/integrations/reconciliation.service';
import { AdapterRegistry } from '../modules/integrations/adapters/registry';
import { PayoutsService } from '../modules/payouts/payouts.service';
import { MetricsService } from '../observability/metrics.service';

/**
 * Scheduled/background work (spec §25). Each task is idempotent and safe to run concurrently on several workers.
 * The worker app triggers these via BullMQ repeatable jobs; tests call them directly.
 */
@Injectable()
export class JobsService {
  private readonly logger = new Logger('JobsService');

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly outbox: OutboxDispatcher,
    private readonly campaigns: CampaignsService,
    private readonly promotion: PromotionService,
    private readonly commissions: CommissionService,
    private readonly ledger: LedgerService,
    private readonly webhooks: WebhooksService,
    private readonly reconciliation: ReconciliationService,
    private readonly adapters: AdapterRegistry,
    private readonly payouts: PayoutsService,
    private readonly metrics: MetricsService,
  ) {}

  async everyMinute(): Promise<Record<string, number>> {
    const now = new Date();
    const campaigns = await this.campaigns.runScheduledTransitions(now);
    const expired = await this.promotion.expireDue(now);
    const released = await this.prisma.$transaction((tx) => this.commissions.releaseDue(tx, now));
    const webhooksRequeued = await this.webhooks.sweep();
    const payoutsRequeued = await this.payouts.sweep();
    const outboxRecovered = await this.outbox.recoverStuck();
    return { ...campaigns, codesExpired: expired, commissionsReleased: released, webhooksRequeued, payoutsRequeued, outboxRecovered };
  }

  /** Hourly ledger invariant monitor (spec §9.3 "ledger invariants must be monitored"). */
  async checkLedger(): Promise<boolean> {
    const r = await this.ledger.verifyInvariants();
    this.metrics.gauge('codek_ledger_invariant_ok', r.ok ? 1 : 0);
    if (!r.ok) this.logger.error({ alert: 'LEDGER_INVARIANT_FAILURE', unbalancedEntries: r.unbalancedEntries, currencies: r.currencyImbalances.map((c) => c.currency) }, 'CRITICAL: ledger invariant failure');
    return r.ok;
  }

  /** Nightly reconciliation: internal ledger + each live integration that can pull orders. */
  async nightlyReconciliation(): Promise<number> {
    await this.reconciliation.runLedger(null);
    const live = await this.prisma.integration.findMany({ where: { status: 'live' } });
    let ran = 0;
    const end = new Date();
    const start = new Date(end.getTime() - 2 * 86400000);
    for (const i of live) {
      if (!this.adapters.get(i.provider)?.fetchOrders) continue;
      try {
        await this.reconciliation.runIntegration(i.id, start, end, null);
        ran++;
      } catch (err) {
        this.logger.warn({ integrationId: i.id, err: (err as Error).message }, 'integration reconciliation failed');
      }
    }
    return ran + 1;
  }

  /** Retention (spec §14.2): minimize tracking data after the retention window; financial/audit history is kept. */
  async retentionCleanup(): Promise<{ clicksAnonymized: number; sessionsExpired: number; idempotencyKeys: number }> {
    const setting = await this.prisma.systemSetting.findUnique({ where: { key: 'retention.tracking_days' } });
    const days = Number((setting?.valueJson as { days?: number } | null)?.days ?? 400);
    const cutoff = new Date(Date.now() - days * 86400000);
    const clicks = await this.prisma.trackingClick.updateMany({ where: { occurredAt: { lt: cutoff }, OR: [{ ipHash: { not: null } }, { userAgentHash: { not: null } }] }, data: { ipHash: null, userAgentHash: null, sessionKeyHash: null, landingUrl: null } });
    const sessions = await this.prisma.trackingSession.deleteMany({ where: { expiresAt: { lt: cutoff } } });
    const idem = await this.prisma.idempotencyKey.deleteMany({ where: { expiresAt: { lt: new Date() } } });
    return { clicksAnonymized: clicks.count, sessionsExpired: sessions.count, idempotencyKeys: idem.count };
  }
}
