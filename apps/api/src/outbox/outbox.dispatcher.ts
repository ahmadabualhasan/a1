import { Global, Inject, Injectable, Logger, Module } from '@nestjs/common';
import type { OutboxEvent, PrismaClient } from '@codek/database';
import { PRISMA } from '../prisma/prisma.service';

export type OutboxHandler = (event: OutboxEvent) => Promise<void>;

/** Registry that domain modules use to subscribe to internal events (notifications, fraud scoring, analytics). */
@Injectable()
export class OutboxHandlers {
  private readonly handlers = new Map<string, OutboxHandler[]>();

  on(eventType: string, handler: OutboxHandler): void {
    this.handlers.set(eventType, [...(this.handlers.get(eventType) ?? []), handler]);
  }

  for(eventType: string): OutboxHandler[] {
    return [...(this.handlers.get(eventType) ?? []), ...(this.handlers.get('*') ?? [])];
  }
}

const MAX_ATTEMPTS = 8;

/**
 * Publishes committed outbox rows to in-process handlers. Rows are claimed with FOR UPDATE SKIP LOCKED so multiple
 * workers can run safely; handlers must be idempotent (at-least-once delivery). Failures back off exponentially and
 * stop at MAX_ATTEMPTS (status=failed, visible to operations).
 */
@Injectable()
export class OutboxDispatcher {
  private readonly logger = new Logger('OutboxDispatcher');

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly handlers: OutboxHandlers,
  ) {}

  async dispatchBatch(limit = 100): Promise<{ published: number; failed: number }> {
    const claimed = await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM outbox_events
         WHERE status IN ('pending', 'failed') AND attempt_count < ${MAX_ATTEMPTS} AND (next_attempt_at IS NULL OR next_attempt_at <= now())
         ORDER BY created_at LIMIT ${limit} FOR UPDATE SKIP LOCKED`;
      if (!rows.length) return [];
      const ids = rows.map((r) => r.id);
      await tx.outboxEvent.updateMany({ where: { id: { in: ids } }, data: { status: 'processing', attemptCount: { increment: 1 } } });
      return tx.outboxEvent.findMany({ where: { id: { in: ids } }, orderBy: { createdAt: 'asc' } });
    });
    let published = 0;
    let failed = 0;
    for (const ev of claimed) {
      try {
        for (const h of this.handlers.for(ev.eventType)) await h(ev);
        await this.prisma.outboxEvent.update({ where: { id: ev.id }, data: { status: 'published', publishedAt: new Date(), lastError: null } });
        published++;
      } catch (err) {
        failed++;
        const delay = Math.min(2 ** ev.attemptCount * 5_000, 3_600_000);
        await this.prisma.outboxEvent.update({ where: { id: ev.id }, data: { status: 'failed', lastError: (err as Error).message.slice(0, 500), nextAttemptAt: new Date(Date.now() + delay) } });
        this.logger.warn({ outboxId: ev.id, eventType: ev.eventType, err: (err as Error).message }, 'outbox handler failed');
      }
    }
    return { published, failed };
  }

  /** Reset rows stuck in `processing` (worker crashed mid-dispatch). */
  async recoverStuck(olderThanMs = 5 * 60_000): Promise<number> {
    const r = await this.prisma.outboxEvent.updateMany({ where: { status: 'processing', createdAt: { lte: new Date(Date.now() - olderThanMs) } }, data: { status: 'failed', nextAttemptAt: new Date() } });
    return r.count;
  }
}

@Global()
@Module({ providers: [OutboxHandlers, OutboxDispatcher], exports: [OutboxHandlers, OutboxDispatcher] })
export class OutboxDispatchModule {}
