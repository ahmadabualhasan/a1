import { Inject, Injectable, Logger } from '@nestjs/common';
import type { PrismaClient } from '@codek/database';
import { PRISMA } from '../../prisma/prisma.service';
import { EmailService } from '../../email/email.service';
import { page, type Pagination } from '../../common/pagination';
import { notFound } from '../../common/errors';
import type { Principal } from '../../auth/principal';

export interface NotifyInput {
  userIds: string[];
  type: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  /** Makes the notification idempotent per user (outbox redelivery never duplicates). */
  dedupeKey: string;
  /** Deep link inside the web app, e.g. /creator/partnerships/<id>. */
  link?: string;
}

/** Notification types and their default channels (spec §12.1). Preferences override per type. */
export const NOTIFICATION_TYPES: Record<string, { email: boolean; description: string }> = {
  'application.submitted': { email: true, description: 'A creator applied to your campaign' },
  'application.decided': { email: true, description: 'Your application was accepted or declined' },
  'invitation.received': { email: true, description: 'A business invited you to a campaign' },
  'partnership.created': { email: true, description: 'A new partnership started' },
  'commission.approved': { email: false, description: 'A commission was approved' },
  'commission.reversed': { email: true, description: 'A commission was reduced after a refund' },
  'funding.received': { email: true, description: 'Funding was received' },
  'payout.processed': { email: true, description: 'A payout was completed' },
  'payout.failed': { email: true, description: 'A payout could not be completed' },
  'deliverable.submitted': { email: true, description: 'A creator submitted content' },
  'deliverable.reviewed': { email: true, description: 'Your content was reviewed' },
  'message.received': { email: false, description: 'New partnership message' },
  'dispute.updated': { email: true, description: 'A dispute changed status' },
  'verification.updated': { email: true, description: 'Your verification status changed' },
};

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger('NotificationsService');

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly email: EmailService,
  ) {}

  async notify(input: NotifyInput): Promise<number> {
    let created = 0;
    const defaults = NOTIFICATION_TYPES[input.type] ?? { email: false };
    for (const userId of [...new Set(input.userIds)]) {
      const pref = await this.prisma.notificationPreference.findUnique({ where: { userId_notificationType: { userId, notificationType: input.type } } });
      const inApp = pref?.inAppEnabled ?? true;
      const email = pref?.emailEnabled ?? defaults.email;
      const data = { ...(input.data ?? {}), link: input.link ?? null };
      if (inApp) {
        const r = await this.prisma.notification.createMany({ data: [{ userId, type: input.type, channel: 'in_app', title: input.title, body: input.body, dataJson: data, dedupeKey: `${input.dedupeKey}:${userId}:in_app` }], skipDuplicates: true });
        created += r.count;
      }
      if (email) {
        const r = await this.prisma.notification.createMany({ data: [{ userId, type: input.type, channel: 'email', title: input.title, body: input.body, dataJson: data, dedupeKey: `${input.dedupeKey}:${userId}:email` }], skipDuplicates: true });
        if (r.count) {
          const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { email: true, status: true } });
          if (user?.status === 'active') {
            try {
              await this.email.send({ to: user.email, subject: input.title, text: `${input.body}\n\n${input.link ? `Open CODEK: ${input.link}` : ''}`.trim(), template: `notification.${input.type}` });
              await this.prisma.notification.updateMany({ where: { dedupeKey: `${input.dedupeKey}:${userId}:email` }, data: { sentAt: new Date() } });
            } catch (err) {
              await this.prisma.notification.updateMany({ where: { dedupeKey: `${input.dedupeKey}:${userId}:email` }, data: { failedAt: new Date() } });
              this.logger.warn({ type: input.type, err: (err as Error).message }, 'email notification failed');
            }
          }
        }
      }
    }
    return created;
  }

  /** Users of a business holding a permission (e.g. who reviews applications). */
  async businessRecipients(businessId: string, permission: string): Promise<string[]> {
    const members = await this.prisma.businessMember.findMany({ where: { businessId, status: 'active', role: { permissions: { some: { permission: { key: permission } } } } }, select: { userId: true } });
    return members.map((m) => m.userId);
  }

  async creatorUser(creatorId: string): Promise<string[]> {
    const c = await this.prisma.creator.findUnique({ where: { id: creatorId }, select: { userId: true } });
    return c ? [c.userId] : [];
  }

  async list(p: Principal, q: Pagination & { unreadOnly?: boolean }) {
    const where = { userId: p.userId, channel: 'in_app' as const, ...(q.unreadOnly ? { readAt: null } : {}) };
    const [items, total, unread] = await Promise.all([
      this.prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' }, take: q.limit, skip: q.offset, select: { id: true, type: true, title: true, body: true, dataJson: true, readAt: true, createdAt: true } }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({ where: { userId: p.userId, channel: 'in_app', readAt: null } }),
    ]);
    return { ...page(items, total, q), unread };
  }

  async unreadCount(p: Principal) {
    return { unread: await this.prisma.notification.count({ where: { userId: p.userId, channel: 'in_app', readAt: null } }) };
  }

  async markRead(p: Principal, id: string) {
    const r = await this.prisma.notification.updateMany({ where: { id, userId: p.userId }, data: { readAt: new Date() } });
    if (!r.count) throw notFound('Notification');
    return { id, read: true };
  }

  async markAllRead(p: Principal) {
    const r = await this.prisma.notification.updateMany({ where: { userId: p.userId, readAt: null }, data: { readAt: new Date() } });
    return { updated: r.count };
  }

  async preferences(p: Principal) {
    const rows = await this.prisma.notificationPreference.findMany({ where: { userId: p.userId } });
    return Object.entries(NOTIFICATION_TYPES).map(([type, d]) => {
      const r = rows.find((x) => x.notificationType === type);
      return { type, description: d.description, inApp: r?.inAppEnabled ?? true, email: r?.emailEnabled ?? d.email };
    });
  }

  async setPreference(p: Principal, type: string, prefs: { inApp: boolean; email: boolean }) {
    if (!NOTIFICATION_TYPES[type]) throw notFound('Notification type');
    await this.prisma.notificationPreference.upsert({
      where: { userId_notificationType: { userId: p.userId, notificationType: type } },
      update: { inAppEnabled: prefs.inApp, emailEnabled: prefs.email },
      create: { userId: p.userId, notificationType: type, inAppEnabled: prefs.inApp, emailEnabled: prefs.email },
    });
    return this.preferences(p);
  }
}
