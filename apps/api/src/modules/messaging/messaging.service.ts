import { Inject, Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';
import type { PrismaClient } from '@codek/database';
import type { Env } from '@codek/config';
import { ENV } from '../../config/config.module';
import { PRISMA } from '../../prisma/prisma.service';
import { REDIS } from '../../redis/redis.module';
import { AccessService } from '../../access/access.service';
import { AuditService } from '../../audit/audit.service';
import { OutboxService } from '../../outbox/outbox.service';
import { SettingsService } from '../../settings/settings.service';
import { ApiError, notFound, ruleViolation } from '../../common/errors';
import type { Principal } from '../../auth/principal';
import { FilesService } from '../files/files.service';

/**
 * Partnership-scoped messaging (spec §12.2): only the two parties of a partnership can read/write; rate limited;
 * abuse reports; moderated messages are hidden (never destroyed) and retained for audit.
 */
@Injectable()
export class MessagingService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(ENV) private readonly env: Env,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly settings: SettingsService,
    private readonly files: FilesService,
  ) {}

  private async conversation(p: Principal, partnershipId: string) {
    const ps = await this.prisma.partnership.findUnique({ where: { id: partnershipId }, include: { conversation: true } });
    if (!ps || !ps.conversation) throw notFound('Conversation');
    const role = this.access.partnershipParty(p, ps, 'messaging.use');
    if (role === 'creator' && !p.creatorPermissions.has('messaging.use')) throw new ApiError('FORBIDDEN', 'Messaging is not available for your account');
    return { ps, conv: ps.conversation, role };
  }

  async list(p: Principal, partnershipId: string, before?: Date, limit = 50) {
    const { conv, role } = await this.conversation(p, partnershipId);
    const rows = await this.prisma.message.findMany({
      where: { conversationId: conv.id, ...(before ? { createdAt: { lt: before } } : {}) },
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 100),
      select: { id: true, senderUserId: true, messageType: true, body: true, fileId: true, createdAt: true, hiddenAt: true, deletedAt: true },
    });
    const items = rows.reverse().map((m) => ({
      ...m,
      body: m.hiddenAt ? 'This message was removed by CODEK moderation.' : m.deletedAt ? 'This message was deleted.' : m.body,
      fileId: m.hiddenAt || m.deletedAt ? null : m.fileId,
      mine: m.senderUserId === p.userId,
    }));
    return { conversationId: conv.id, status: conv.status, viewerRole: role, items };
  }

  async send(p: Principal, partnershipId: string, dto: { body?: string; fileId?: string }) {
    const { ps, conv, role } = await this.conversation(p, partnershipId);
    if (conv.status !== 'active') throw ruleViolation('This conversation is closed');
    if (!dto.body?.trim() && !dto.fileId) throw new ApiError('VALIDATION_FAILED', 'Write a message or attach a file');
    const { max } = await this.settings.get<{ max: number }>('messaging.rate_limit_per_minute', { max: 20 });
    const key = `${this.env.QUEUE_PREFIX}:msg:${p.userId}:${Math.floor(Date.now() / 60000)}`;
    const count = await this.redis.incr(key).catch(() => 0);
    await this.redis.expire(key, 61).catch(() => undefined);
    if (count > max) throw new ApiError('RATE_LIMITED', 'You are sending messages too quickly. Please wait a moment.');
    const msg = await this.prisma.$transaction(async (tx) => {
      let type: 'text' | 'image' | 'file' = 'text';
      if (dto.fileId) {
        await this.files.claim(tx, p, dto.fileId, { ownerType: 'partnership', ownerId: ps.id }, 'message_attachment');
        const f = await tx.file.findUniqueOrThrow({ where: { id: dto.fileId } });
        type = f.mimeType.startsWith('image/') ? 'image' : 'file';
      }
      const m = await tx.message.create({ data: { conversationId: conv.id, senderUserId: p.userId, messageType: type, body: dto.body?.trim() || null, fileId: dto.fileId ?? null } });
      await tx.conversation.update({ where: { id: conv.id }, data: { updatedAt: new Date() } });
      await this.outbox.enqueue(tx, { eventType: 'MessageSent', aggregateType: 'message', aggregateId: m.id, businessId: ps.businessId, payload: { partnershipId: ps.id, businessId: ps.businessId, creatorId: ps.creatorId, recipientRole: role === 'creator' ? 'business' : 'creator' } });
      return m;
    });
    return { ...msg, mine: true };
  }

  async deleteOwn(p: Principal, messageId: string) {
    const m = await this.prisma.message.findUnique({ where: { id: messageId } });
    if (!m || m.senderUserId !== p.userId) throw notFound('Message');
    await this.prisma.message.update({ where: { id: messageId }, data: { deletedAt: new Date() } });
    return { id: messageId, deleted: true };
  }

  async report(p: Principal, messageId: string, reason: string) {
    const m = await this.prisma.message.findUnique({ where: { id: messageId }, include: { conversation: true } });
    if (!m) throw notFound('Message');
    const ps = await this.prisma.partnership.findUniqueOrThrow({ where: { id: m.conversation.partnershipId } });
    this.access.partnershipParty(p, ps, 'messaging.use');
    if (m.senderUserId === p.userId) throw ruleViolation('You cannot report your own message');
    const r = await this.prisma.messageReport.upsert({ where: { messageId_reporterUserId: { messageId, reporterUserId: p.userId } }, update: {}, create: { messageId, reporterUserId: p.userId, reason } });
    await this.audit.record({ actorUserId: p.userId, businessId: ps.businessId, action: 'message.reported', objectType: 'message', objectId: messageId, reason });
    return { id: r.id, status: r.status };
  }

  /** Admin moderation: hide (not delete) a message and resolve its reports. */
  async moderate(p: Principal, messageId: string, action: 'hide' | 'dismiss', note: string) {
    this.access.platform(p, 'admin.moderation.manage');
    const m = await this.prisma.message.findUnique({ where: { id: messageId } });
    if (!m) throw notFound('Message');
    await this.prisma.$transaction(async (tx) => {
      if (action === 'hide') await tx.message.update({ where: { id: messageId }, data: { hiddenAt: new Date(), hiddenBy: p.userId } });
      await tx.messageReport.updateMany({ where: { messageId, status: 'open' }, data: { status: action === 'hide' ? 'actioned' : 'dismissed', resolvedBy: p.userId, resolvedAt: new Date() } });
      await this.audit.record({ actorUserId: p.userId, actorType: 'admin', action: `message.moderation_${action}`, objectType: 'message', objectId: messageId, reason: note }, tx);
    });
    return { id: messageId, action };
  }

  async reports(p: Principal) {
    this.access.platform(p, 'admin.moderation.manage');
    return this.prisma.messageReport.findMany({ where: { status: 'open' }, include: { message: { select: { id: true, body: true, messageType: true, createdAt: true, senderUserId: true, hiddenAt: true } } }, orderBy: { createdAt: 'asc' }, take: 200 });
  }
}
