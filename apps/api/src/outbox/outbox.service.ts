import { Global, Injectable, Module } from '@nestjs/common';
import type { Prisma, TransactionClient } from '@codek/database';
import type { InternalEventType } from '@codek/domain';
import { currentContext } from '../common/request-context';
import { toJsonSafe } from '../common/json';

export interface OutboxInput {
  eventType: InternalEventType;
  aggregateType: string;
  aggregateId: string;
  businessId?: string | null;
  payload: Record<string, unknown>;
}

/**
 * Transactional outbox (spec §11.7): internal events are written in the same DB transaction as the state change and
 * published asynchronously by the worker (notifications, analytics, fraud scoring). Never lost, never published early.
 */
@Injectable()
export class OutboxService {
  async enqueue(tx: TransactionClient, input: OutboxInput): Promise<void> {
    await tx.outboxEvent.create({
      data: {
        eventType: input.eventType,
        schemaVersion: '1',
        aggregateType: input.aggregateType,
        aggregateId: input.aggregateId,
        businessId: input.businessId ?? null,
        correlationId: currentContext()?.correlationId ?? null,
        payloadJson: toJsonSafe(input.payload) as Prisma.InputJsonValue,
        nextAttemptAt: new Date(),
      },
    });
  }
}

@Global()
@Module({ providers: [OutboxService], exports: [OutboxService] })
export class OutboxModule {}
