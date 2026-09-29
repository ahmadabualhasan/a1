import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import type { OutboxEvent, PrismaClient } from '@codek/database';
import { formatMinor } from '@codek/domain';
import type { Env } from '@codek/config';
import { ENV } from '../../config/config.module';
import { PRISMA } from '../../prisma/prisma.service';
import { OutboxHandlers } from '../../outbox/outbox.dispatcher';
import { NotificationsService } from './notifications.service';

const money = (minor: unknown, currency: unknown) => `${formatMinor(BigInt(minor as number), String(currency))} ${String(currency)}`;

/** Turns committed internal events (transactional outbox) into user notifications. Idempotent via dedupe keys. */
@Injectable()
export class NotificationHandlers implements OnModuleInit {
  constructor(
    private readonly handlers: OutboxHandlers,
    private readonly notifications: NotificationsService,
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(ENV) private readonly env: Env,
  ) {}

  private link(path: string): string {
    return `${this.env.WEB_PUBLIC_URL.replace(/\/$/, '')}${path}`;
  }

  onModuleInit(): void {
    const on = (type: string, fn: (e: OutboxEvent, p: Record<string, unknown>) => Promise<void>) => this.handlers.on(type, (e) => fn(e, e.payloadJson as Record<string, unknown>));

    on('ApplicationSubmitted', async (e, p) => {
      const c = await this.prisma.campaign.findUnique({ where: { id: String(p.campaignId) }, select: { name: true, businessId: true } });
      if (!c) return;
      await this.notifications.notify({ userIds: await this.notifications.businessRecipients(c.businessId, 'application.review'), type: 'application.submitted', title: 'New creator application', body: `A creator applied to “${c.name}”.`, dedupeKey: e.id, link: this.link(`/business/applications?campaignId=${String(p.campaignId)}`) });
    });
    on('ApplicationDecided', async (e, p) => {
      const c = await this.prisma.campaign.findUnique({ where: { id: String(p.campaignId) }, select: { name: true } });
      const accepted = p.decision === 'accepted';
      await this.notifications.notify({ userIds: await this.notifications.creatorUser(String(p.creatorId)), type: 'application.decided', title: accepted ? 'You were accepted!' : 'Application update', body: accepted ? `You’re now partnered on “${c?.name}”. Your code, link and QR are ready.` : `Your application to “${c?.name}” was not accepted this time.`, dedupeKey: e.id, link: this.link(accepted ? `/creator/partnerships/${String(p.partnershipId)}` : '/creator/applications') });
    });
    on('InvitationSent', async (e, p) => {
      const c = await this.prisma.campaign.findUnique({ where: { id: String(p.campaignId) }, include: { business: { select: { displayName: true } } } });
      await this.notifications.notify({ userIds: await this.notifications.creatorUser(String(p.creatorId)), type: 'invitation.received', title: 'You have a new invitation', body: `${c?.business.displayName} invited you to “${c?.name}”.`, dedupeKey: e.id, link: this.link('/creator/invitations') });
    });
    on('PartnershipCreated', async (e, p) => {
      if (!e.businessId) return;
      await this.notifications.notify({ userIds: await this.notifications.businessRecipients(e.businessId, 'partnership.read'), type: 'partnership.created', title: 'New partnership', body: 'A creator partnership is now set up with its promotion code and link.', dedupeKey: e.id, link: this.link(`/business/partnerships/${String(p.partnershipId)}`) });
    });
    on('CommissionApproved', async (e, p) => {
      await this.notifications.notify({ userIds: await this.notifications.creatorUser(String(p.creatorId)), type: 'commission.approved', title: 'Commission approved', body: `A commission of ${money(p.commissionMinor, p.currency)} was approved.`, dedupeKey: e.id, link: this.link('/creator/earnings') });
    });
    on('CommissionReversed', async (e, p) => {
      await this.notifications.notify({ userIds: await this.notifications.creatorUser(String(p.creatorId)), type: 'commission.reversed', title: 'Commission adjusted', body: `A customer refund reduced a commission by ${money(p.reversedMinor, p.currency)}.`, dedupeKey: e.id, link: this.link('/creator/earnings') });
    });
    on('FundingReceived', async (e, p) => {
      if (!e.businessId) return;
      await this.notifications.notify({ userIds: await this.notifications.businessRecipients(e.businessId, 'funding.read'), type: 'funding.received', title: 'Funding received', body: `We received ${money(p.amountMinor, p.currency)}.`, dedupeKey: e.id, link: this.link('/business/funding') });
    });
    on('PayoutProcessed', async (e, p) => {
      await this.notifications.notify({ userIds: await this.notifications.creatorUser(String(p.creatorId)), type: 'payout.processed', title: 'Payout sent', body: `Your payout of ${money(p.amountMinor, p.currency)} was completed by the payout provider.`, dedupeKey: e.id, link: this.link('/creator/payouts') });
    });
    on('PayoutFailed', async (e, p) => {
      await this.notifications.notify({ userIds: await this.notifications.creatorUser(String(p.creatorId)), type: 'payout.failed', title: 'Payout could not be completed', body: 'Your payout failed and the amount is available again. Please check your payout method.', dedupeKey: e.id, link: this.link('/creator/payouts') });
    });
    on('DeliverableSubmitted', async (e, p) => {
      if (!e.businessId) return;
      await this.notifications.notify({ userIds: await this.notifications.businessRecipients(e.businessId, 'partnership.manage'), type: 'deliverable.submitted', title: 'Content submitted for review', body: 'A creator submitted content for your review.', dedupeKey: e.id, link: this.link(`/business/partnerships/${String(p.partnershipId)}`) });
    });
    on('DeliverableReviewed', async (e, p) => {
      await this.notifications.notify({ userIds: await this.notifications.creatorUser(String(p.creatorId)), type: 'deliverable.reviewed', title: p.decision === 'approved' ? 'Content approved' : 'Changes requested', body: p.decision === 'approved' ? 'The business approved your content.' : `The business asked for changes: ${String(p.note ?? '')}`.slice(0, 500), dedupeKey: e.id, link: this.link(`/creator/partnerships/${String(p.partnershipId)}`) });
    });
    on('MessageSent', async (e, p) => {
      const userIds = p.recipientRole === 'creator' ? await this.notifications.creatorUser(String(p.creatorId)) : await this.notifications.businessRecipients(String(p.businessId), 'messaging.use');
      await this.notifications.notify({ userIds, type: 'message.received', title: 'New message', body: 'You have a new partnership message.', dedupeKey: e.id, link: this.link(`/${p.recipientRole === 'creator' ? 'creator' : 'business'}/partnerships/${String(p.partnershipId)}?tab=messages`) });
    });
    on('DisputeOpened', async (e, p) => {
      const ids = [...(p.creatorId ? await this.notifications.creatorUser(String(p.creatorId)) : []), ...(e.businessId ? await this.notifications.businessRecipients(e.businessId, 'dispute.open') : [])];
      await this.notifications.notify({ userIds: ids, type: 'dispute.updated', title: 'A dispute was opened', body: 'CODEK operations will review the case. You can add evidence from the dispute page.', dedupeKey: e.id, link: this.link(`/disputes/${String(p.disputeId)}`) });
    });
  }
}
