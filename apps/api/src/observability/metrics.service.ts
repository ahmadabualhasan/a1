import { Global, Inject, Injectable, Module } from '@nestjs/common';
import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from 'prom-client';
import type { PrismaClient } from '@codek/database';
import { PRISMA } from '../prisma/prisma.service';
import { QueueService } from '../queue/queue.service';

/**
 * Prometheus metrics (spec §24.2): API latency/error rate, queue depth, webhook backlog/failures/DLQ, conversion
 * mismatches, ledger invariant, funding shortfall, payout failures, fraud spikes, auth failures.
 */
@Injectable()
export class MetricsService {
  readonly registry = new Registry();
  readonly httpDuration = new Histogram({ name: 'codek_http_request_duration_seconds', help: 'API latency', labelNames: ['method', 'route', 'status'], buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5], registers: [this.registry] });
  readonly httpErrors = new Counter({ name: 'codek_http_errors_total', help: 'API 5xx responses', labelNames: ['route'], registers: [this.registry] });
  readonly authFailures = new Counter({ name: 'codek_auth_failures_total', help: 'Failed sign-in attempts', registers: [this.registry] });
  private readonly gauges = new Map<string, Gauge>();

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly queues: QueueService,
  ) {
    collectDefaultMetrics({ register: this.registry, prefix: 'codek_' });
  }

  gauge(name: string, value: number, labels: Record<string, string> = {}): void {
    let g = this.gauges.get(name);
    if (!g) {
      g = new Gauge({ name, help: name.replace(/_/g, ' '), labelNames: Object.keys(labels), registers: [this.registry] });
      this.gauges.set(name, g);
    }
    if (Object.keys(labels).length) g.set(labels, value);
    else g.set(value);
  }

  /** Business/operational gauges computed at scrape time from the database and Redis. */
  async collectOperational(): Promise<void> {
    const [backlog, dlq, failedPayouts24h, openFraud, mismatches, outboxFailed, shortfall] = await Promise.all([
      this.prisma.webhookEvent.count({ where: { processingState: { in: ['received', 'queued', 'processing', 'failed'] }, signatureValid: true } }),
      this.prisma.webhookEvent.count({ where: { processingState: 'dead_letter' } }),
      this.prisma.payout.count({ where: { status: 'failed', updatedAt: { gte: new Date(Date.now() - 86400000) } } }),
      this.prisma.fraudFlag.count({ where: { status: { in: ['open', 'reviewing'] } } }),
      this.prisma.reconciliationItem.count({ where: { status: { not: 'matched' }, resolvedAt: null } }),
      this.prisma.outboxEvent.count({ where: { status: 'failed' } }),
      this.prisma.commissionCalculation.count({ where: { status: 'approved' } }),
    ]);
    this.gauge('codek_webhook_backlog', backlog);
    this.gauge('codek_webhook_dead_letter_total', dlq);
    this.gauge('codek_payout_failures_24h', failedPayouts24h);
    this.gauge('codek_fraud_flags_open', openFraud);
    this.gauge('codek_reconciliation_unresolved_items', mismatches);
    this.gauge('codek_outbox_failed', outboxFailed);
    this.gauge('codek_commissions_awaiting_funding', shortfall);
    const depths = await this.queues.depths();
    for (const [queue, counts] of Object.entries(depths)) {
      for (const [state, n] of Object.entries(counts)) this.gauge('codek_queue_jobs', n, { queue, state });
    }
  }

  async render(): Promise<{ contentType: string; body: string }> {
    await this.collectOperational().catch(() => undefined);
    return { contentType: this.registry.contentType, body: await this.registry.metrics() };
  }
}

@Global()
@Module({ providers: [MetricsService], exports: [MetricsService] })
export class MetricsModule {}
