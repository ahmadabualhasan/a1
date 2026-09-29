import { Global, Inject, Injectable, Logger, Module, OnModuleDestroy } from '@nestjs/common';
import { Queue, type JobsOptions } from 'bullmq';
import type { Env } from '@codek/config';
import { ENV } from '../config/config.module';
import { DEFAULT_JOB_OPTIONS, QUEUES, type QueueName } from './queues';

/** BullMQ producer. Jobs carry ids only; workers load state from the DB so retries are idempotent. */
@Injectable()
export class QueueService implements OnModuleDestroy {
  private readonly logger = new Logger('QueueService');
  private readonly queues = new Map<QueueName, Queue>();

  constructor(@Inject(ENV) private readonly env: Env) {}

  queue(name: QueueName): Queue {
    let q = this.queues.get(name);
    if (!q) {
      const url = new URL(this.env.REDIS_URL);
      q = new Queue(name, {
        connection: { host: url.hostname, port: Number(url.port || 6379), password: url.password || undefined, username: url.username || undefined, maxRetriesPerRequest: null, enableOfflineQueue: false },
        prefix: this.env.QUEUE_PREFIX,
        defaultJobOptions: DEFAULT_JOB_OPTIONS,
      });
      q.on('error', (err) => this.logger.warn({ queue: name, err: err.message }, 'queue connection error'));
      this.queues.set(name, q);
    }
    return q;
  }

  /**
   * Enqueue a job. Failure to enqueue never loses work: every job's source of truth is a DB row that a sweeper
   * re-enqueues (webhook_events, outbox_events, payouts). Returns false when Redis is unavailable.
   */
  async add(name: QueueName, jobName: string, data: Record<string, unknown>, opts: JobsOptions = {}): Promise<boolean> {
    try {
      await this.queue(name).add(jobName, data, opts);
      return true;
    } catch (err) {
      this.logger.warn({ queue: name, jobName, err: (err as Error).message }, 'enqueue failed; sweeper will retry');
      return false;
    }
  }

  async depths(): Promise<Record<string, Record<string, number>>> {
    const out: Record<string, Record<string, number>> = {};
    for (const name of Object.values(QUEUES)) {
      try {
        out[name] = await this.queue(name).getJobCounts('waiting', 'active', 'delayed', 'failed', 'completed');
      } catch {
        out[name] = {};
      }
    }
    return out;
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all([...this.queues.values()].map((q) => q.close().catch(() => undefined)));
  }
}

@Global()
@Module({ providers: [QueueService], exports: [QueueService] })
export class QueueModule {}
