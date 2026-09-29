import { Global, Inject, Injectable, Module } from '@nestjs/common';
import type { Prisma, PrismaClient, TransactionClient } from '@codek/database';
import { PRISMA } from '../prisma/prisma.service';
import { currentContext } from '../common/request-context';
import { toJsonSafe } from '../common/json';

export interface AuditInput {
  actorUserId?: string | null;
  actorType?: 'user' | 'system' | 'provider' | 'admin';
  businessId?: string | null;
  action: string;
  objectType: string;
  objectId?: string | null;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
}

/** Append-only, hash-chained audit trail (spec §13.5). Write inside the same transaction as the change. */
@Injectable()
export class AuditService {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  async record(input: AuditInput, tx?: TransactionClient): Promise<void> {
    const ctx = currentContext();
    const client = tx ?? this.prisma;
    await client.auditLog.create({
      data: {
        actorUserId: input.actorUserId ?? ctx?.userId ?? null,
        actorType: input.actorType ?? (input.actorUserId || ctx?.userId ? 'user' : 'system'),
        tenantBusinessId: input.businessId ?? null,
        action: input.action,
        objectType: input.objectType,
        objectId: input.objectId ?? null,
        beforeJson: input.before === undefined ? undefined : (toJsonSafe(input.before) as Prisma.InputJsonValue),
        afterJson: input.after === undefined ? undefined : (toJsonSafe(input.after) as Prisma.InputJsonValue),
        reason: input.reason ?? null,
        ipHash: ctx?.ipHash ?? null,
        requestId: ctx?.requestId ?? null,
      },
    });
  }
}

@Global()
@Module({ providers: [AuditService], exports: [AuditService] })
export class AuditModule {}
