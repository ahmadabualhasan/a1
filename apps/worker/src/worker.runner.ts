import http from 'node:http';
import { Inject, Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { Queue, Worker, type Job } from 'bullmq';
import type { Env } from '@codek/config';
import { DEFAULT_JOB_OPTIONS, ENV, JobsService, OutboxDispatcher, PayoutsService, QUEUES, WebhooksService } from '@codek/api';

type Handler = (job: Job) => Promise<unknown>;

/**
 * Starts BullMQ consumers (spec §25): idempotent workers, exponential backoff, explicit dead-letter queue, and
 * repeatable scheduler jobs. Exposes /health on WORKER_HEALTH_PORT for container liveness/readiness.
 */
@Injectable()
export class WorkerRunner implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger('WorkerRunner');
  private readonly workers: Worker[] = [];
  private readonly queues: Queue[] = [];
  private server?: http.Server;
  private ready = false;

  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly jobs: JobsService,
    private readonly outbox: OutboxDispatcher,
    private readonly webhooks: WebhooksService,
    private readonly payouts: PayoutsService,
  ) {}

  private connection() {
    const url = new URL(this.env.REDIS_URL);
    return { host: url.hostname, port: Number(url.port || 6379), password: url.password || undefined, username: url.username || undefined, maxRetriesPerRequest: null };
  }

  private consume(name: string, handler: Handler, concurrency = 5): void {
    const worker = new Worker(name, handler, { connection: this.connection(), prefix: this.env.QUEUE_PREFIX, concurrency });
    worker.on('failed', async (job, err) => {
      const attempts = job?.opts.attempts ?? 1;
      this.logger.warn({ queue: name, jobId: job?.id, attempt: job?.attemptsMade, err: err.message }, 'job failed');
      if (job && job.attemptsMade >= attempts && name !== QUEUES.deadLetter) {
        await this.queue(QUEUES.deadLetter).add(`${name}:${job.name}`, { queue: name, jobId: job.id, data: job.data, error: err.message.slice(0, 500) });
      }
    });
    worker.on('error', (err) => this.logger.error({ queue: name, err: err.message }, 'worker error'));
    this.workers.push(worker);
  }

  private queue(name: string): Queue {
    let q = this.queues.find((x) => x.name === name);
    if (!q) {
      q = new Queue(name, { connection: this.connection(), prefix: this.env.QUEUE_PREFIX, defaultJobOptions: DEFAULT_JOB_OPTIONS });
      this.queues.push(q);
    }
    return q;
  }

  async onApplicationBootstrap(): Promise<void> {
    this.consume(QUEUES.webhookProcessing, (job) => this.webhooks.process(String(job.data.webhookEventId), job.attemptsMade + 1, job.opts.attempts ?? 6), 10);
    this.consume(QUEUES.payoutProcessing, async (job) => {
      const r = await this.payouts.process(String(job.data.payoutId));
      if (r.retryInMs) await this.queue(QUEUES.payoutProcessing).add('process', { payoutId: job.data.payoutId }, { delay: r.retryInMs, jobId: `payout-${job.data.payoutId}-${Date.now()}` });
      return r;
    }, 3);
    this.consume(QUEUES.deadLetter, async (job) => {
      this.logger.error({ alert: 'DEAD_LETTER', job: job.name, data: job.data }, 'job moved to dead-letter queue');
    }, 1);
    this.consume(QUEUES.scheduler, async (job) => {
      switch (job.name) {
        case 'outbox':
          return this.outbox.dispatchBatch(200);
        case 'every-minute':
          return this.jobs.everyMinute();
        case 'ledger-check':
          return this.jobs.checkLedger();
        case 'nightly-reconciliation':
          return this.jobs.nightlyReconciliation();
        case 'retention':
          return this.jobs.retentionCleanup();
        default:
          return null;
      }
    }, 2);

    const scheduler = this.queue(QUEUES.scheduler);
    await scheduler.upsertJobScheduler('outbox', { every: 5_000 }, { name: 'outbox' });
    await scheduler.upsertJobScheduler('every-minute', { every: 60_000 }, { name: 'every-minute' });
    await scheduler.upsertJobScheduler('ledger-check', { every: 3_600_000 }, { name: 'ledger-check' });
    await scheduler.upsertJobScheduler('nightly-reconciliation', { pattern: '17 2 * * *' }, { name: 'nightly-reconciliation' });
    await scheduler.upsertJobScheduler('retention', { pattern: '43 3 * * *' }, { name: 'retention' });
    this.ready = true;

    const port = Number(process.env.WORKER_HEALTH_PORT ?? 4100);
    this.server = http.createServer((req, res) => {
      const ok = req.url === '/health/live' || (req.url === '/health/ready' && this.ready && this.workers.every((w) => w.isRunning()));
      res.writeHead(ok ? 200 : 503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: ok ? 'ok' : 'unavailable' }));
    });
    this.server.listen(port);
    this.logger.log({ queues: this.workers.map((w) => w.name), healthPort: port }, 'worker started');
  }

  async onApplicationShutdown(): Promise<void> {
    this.ready = false;
    await Promise.all(this.workers.map((w) => w.close()));
    await Promise.all(this.queues.map((q) => q.close()));
    this.server?.close();
  }
}
