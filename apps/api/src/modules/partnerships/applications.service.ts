import { Inject, Injectable } from '@nestjs/common';
import type { CampaignEligibilityRule, Prisma, PrismaClient } from '@codek/database';
import { ApplicationMachine, assertTransition, InvitationMachine, type ApplicationStatus, type InvitationStatus } from '@codek/domain';
import { PRISMA } from '../../prisma/prisma.service';
import { AccessService } from '../../access/access.service';
import { AuditService } from '../../audit/audit.service';
import { OutboxService } from '../../outbox/outbox.service';
import { ApiError, notFound, ruleViolation } from '../../common/errors';
import { page, type Pagination } from '../../common/pagination';
import type { Principal } from '../../auth/principal';
import { CampaignsService, type CampaignWithRelations } from '../campaigns/campaigns.service';
import { PartnershipFactory } from './partnership-factory.service';

@Injectable()
export class ApplicationsService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly campaigns: CampaignsService,
    private readonly factory: PartnershipFactory,
  ) {}

  // ─────────────── Creator: apply / withdraw ───────────────

  async apply(p: Principal, campaignId: string, message?: string) {
    const creatorId = this.access.creatorId(p, 'creator.marketplace.use');
    const c = await this.campaigns.load(campaignId);
    if (!['published', 'active'].includes(c.status)) throw ruleViolation('This campaign is not accepting applications');
    if (c.applicationDeadlineAt && c.applicationDeadlineAt <= new Date()) throw ruleViolation('The application deadline has passed', { reason: 'DEADLINE_PASSED' });
    await this.checkEligibility(creatorId, c.eligibilityRules);
    return this.prisma.$transaction(async (tx) => {
      await this.factory.lockCampaign(tx, c.id);
      if (await tx.campaignApplication.findUnique({ where: { campaignId_creatorId: { campaignId, creatorId } } })) throw new ApiError('CONFLICT', 'You already applied to this campaign');
      if (await tx.partnership.findUnique({ where: { campaignId_creatorId: { campaignId, creatorId } } })) throw new ApiError('CONFLICT', 'You already work on this campaign');
      const taken = await this.campaigns.activeParticipants(c.id, tx);
      const full = c.participantCap != null && taken >= c.participantCap;
      let status: ApplicationStatus = 'pending';
      let waitlistPosition: number | null = null;
      if (full) {
        if (!c.waitlistEnabled) throw ruleViolation('This campaign is full', { reason: 'CAPACITY_REACHED' });
        const max = await tx.campaignApplication.aggregate({ where: { campaignId }, _max: { waitlistPosition: true } });
        status = 'waitlisted';
        waitlistPosition = (max._max.waitlistPosition ?? 0) + 1;
      }
      const app = await tx.campaignApplication.create({ data: { campaignId, creatorId, status, message, waitlistPosition, campaignConfigVersion: c.configVersion } });
      await this.audit.record({ actorUserId: p.userId, businessId: c.businessId, action: 'application.submitted', objectType: 'campaign_application', objectId: app.id, after: { status, waitlistPosition } }, tx);
      await this.outbox.enqueue(tx, { eventType: 'ApplicationSubmitted', aggregateType: 'campaign_application', aggregateId: app.id, businessId: c.businessId, payload: { applicationId: app.id, campaignId, creatorId, status } });
      return app;
    });
  }

  private async checkEligibility(creatorId: string, rules: CampaignEligibilityRule[]): Promise<void> {
    const enabled = rules.filter((r) => r.enabled);
    if (!enabled.length) return;
    const creator = await this.prisma.creator.findUniqueOrThrow({ where: { id: creatorId }, include: { socialAccounts: true } });
    const failures: string[] = [];
    for (const r of enabled) {
      const v = r.value as Record<string, unknown>;
      if (r.ruleType === 'min_followers') {
        const accounts = creator.socialAccounts.filter((s) => !v.platform || s.platform === v.platform);
        const max = accounts.reduce((m, s) => (s.followerCount != null && s.followerCount > m ? s.followerCount : m), 0n);
        if (max < BigInt(v.count as number)) failures.push(`At least ${v.count} followers${v.platform ? ` on ${v.platform}` : ''}`);
      } else if (r.ruleType === 'country') {
        if (!creator.country || !(v.countries as string[]).includes(creator.country)) failures.push(`Based in ${(v.countries as string[]).join(', ')}`);
      } else if (r.ruleType === 'category') {
        if (!(v.categories as string[]).some((cat) => creator.categories.includes(cat))) failures.push(`Creates content about ${(v.categories as string[]).join(', ')}`);
      } else if (r.ruleType === 'verified_only') {
        if (creator.verificationStatus !== 'verified') failures.push('Verified creators only');
      }
    }
    if (failures.length) throw ruleViolation('You do not meet this campaign’s requirements', { reason: 'NOT_ELIGIBLE', requirements: failures });
  }

  async withdraw(p: Principal, id: string) {
    const creatorId = this.access.creatorId(p, 'creator.marketplace.use');
    const app = await this.prisma.campaignApplication.findFirst({ where: { id, creatorId }, include: { campaign: true } });
    if (!app) throw notFound('Application');
    assertTransition(ApplicationMachine, app.status as ApplicationStatus, 'withdrawn');
    return this.prisma.$transaction(async (tx) => {
      await tx.campaignApplication.update({ where: { id }, data: { status: 'withdrawn', version: { increment: 1 } } });
      await this.audit.record({ actorUserId: p.userId, businessId: app.campaign.businessId, action: 'application.withdrawn', objectType: 'campaign_application', objectId: id }, tx);
      return tx.campaignApplication.findUniqueOrThrow({ where: { id } });
    });
  }

  async creatorApplications(p: Principal, q: Pagination) {
    const creatorId = this.access.creatorId(p, 'creator.marketplace.use');
    const where = { creatorId };
    const [items, total] = await Promise.all([
      this.prisma.campaignApplication.findMany({ where, include: { campaign: { select: { id: true, name: true, status: true, business: { select: { displayName: true } } } } }, orderBy: { submittedAt: 'desc' }, take: q.limit, skip: q.offset }),
      this.prisma.campaignApplication.count({ where }),
    ]);
    return page(items, total, q);
  }

  // ─────────────── Business: review ───────────────

  async businessApplications(p: Principal, businessId: string, q: Pagination & { campaignId?: string; status?: string }) {
    this.access.businessAccess(p, businessId, 'application.review');
    const where: Prisma.CampaignApplicationWhereInput = { campaign: { businessId }, ...(q.campaignId ? { campaignId: q.campaignId } : {}), ...(q.status ? { status: q.status as ApplicationStatus } : {}) };
    const [items, total] = await Promise.all([
      this.prisma.campaignApplication.findMany({
        where,
        include: {
          campaign: { select: { id: true, name: true } },
          creator: { select: { id: true, handle: true, displayName: true, city: true, country: true, categories: true, verificationStatus: true, socialAccounts: { select: { platform: true, followerCount: true, verificationState: true, engagementRate: true } } } },
        },
        orderBy: [{ status: 'asc' }, { waitlistPosition: { sort: 'asc', nulls: 'last' } }, { submittedAt: 'asc' }],
        take: q.limit,
        skip: q.offset,
      }),
      this.prisma.campaignApplication.count({ where }),
    ]);
    return page(items, total, q);
  }

  private async loadApplicationForBusiness(p: Principal, id: string) {
    const app = await this.prisma.campaignApplication.findUnique({ where: { id } });
    if (!app) throw notFound('Application');
    const c = await this.campaigns.load(app.campaignId);
    this.access.businessAccess(p, c.businessId, 'application.review');
    return { app, c };
  }

  async accept(p: Principal, id: string) {
    const { app, c } = await this.loadApplicationForBusiness(p, id);
    assertTransition(ApplicationMachine, app.status as ApplicationStatus, 'accepted');
    if (!['published', 'active', 'paused'].includes(c.status)) throw ruleViolation('This campaign is no longer running');
    return this.prisma.$transaction(async (tx) => {
      await this.factory.lockCampaign(tx, c.id);
      const fresh = await this.campaigns.load(c.id);
      await this.factory.assertCapacity(tx, fresh);
      const r = await tx.campaignApplication.updateMany({ where: { id, status: app.status }, data: { status: 'accepted', reviewedAt: new Date(), reviewedBy: p.userId, waitlistPosition: null, version: { increment: 1 } } });
      if (r.count === 0) throw new ApiError('VERSION_CONFLICT', 'This application was already handled');
      // Terms changed since the creator applied → the creator must re-confirm (partnership stays pending).
      const termsChanged = app.campaignConfigVersion !== fresh.configVersion;
      const created = await this.factory.create(tx, fresh, { creatorId: app.creatorId, acceptedByUserId: p.userId, applicationId: id, status: termsChanged ? 'pending' : 'active' });
      await this.audit.record({ actorUserId: p.userId, businessId: c.businessId, action: 'application.accepted', objectType: 'campaign_application', objectId: id, after: { partnershipId: created.partnership.id } }, tx);
      await this.outbox.enqueue(tx, { eventType: 'ApplicationDecided', aggregateType: 'campaign_application', aggregateId: id, businessId: c.businessId, payload: { applicationId: id, decision: 'accepted', creatorId: app.creatorId, campaignId: c.id, partnershipId: created.partnership.id } });
      return { application: await tx.campaignApplication.findUniqueOrThrow({ where: { id } }), partnership: created.partnership, assets: created.assets, requiresCreatorConfirmation: termsChanged };
    });
  }

  async reject(p: Principal, id: string, reason?: string) {
    const { app, c } = await this.loadApplicationForBusiness(p, id);
    assertTransition(ApplicationMachine, app.status as ApplicationStatus, 'rejected');
    return this.prisma.$transaction(async (tx) => {
      const r = await tx.campaignApplication.updateMany({ where: { id, status: app.status }, data: { status: 'rejected', reviewedAt: new Date(), reviewedBy: p.userId, rejectionReason: reason, version: { increment: 1 } } });
      if (r.count === 0) throw new ApiError('VERSION_CONFLICT', 'This application was already handled');
      await this.audit.record({ actorUserId: p.userId, businessId: c.businessId, action: 'application.rejected', objectType: 'campaign_application', objectId: id, reason }, tx);
      await this.outbox.enqueue(tx, { eventType: 'ApplicationDecided', aggregateType: 'campaign_application', aggregateId: id, businessId: c.businessId, payload: { applicationId: id, decision: 'rejected', creatorId: app.creatorId, campaignId: c.id } });
      return tx.campaignApplication.findUniqueOrThrow({ where: { id } });
    });
  }

  // ─────────────── Invitations (business-initiated) ───────────────

  async invite(p: Principal, businessId: string, dto: { creatorId: string; campaignId: string; message?: string; expiresInDays?: number }) {
    this.access.businessAccess(p, businessId, 'application.review');
    const c = await this.campaigns.load(dto.campaignId);
    if (c.businessId !== businessId) throw notFound('Campaign');
    if (!['published', 'active'].includes(c.status)) throw ruleViolation('Publish the campaign before inviting creators');
    const creator = await this.prisma.creator.findUnique({ where: { id: dto.creatorId }, include: { user: { select: { status: true } } } });
    if (!creator || creator.user.status !== 'active') throw notFound('Creator');
    if (await this.prisma.partnership.findUnique({ where: { campaignId_creatorId: { campaignId: c.id, creatorId: creator.id } } })) throw new ApiError('CONFLICT', 'This creator already works on this campaign');
    if (await this.prisma.campaignInvitation.findFirst({ where: { campaignId: c.id, creatorId: creator.id, status: 'pending' } })) throw new ApiError('CONFLICT', 'An invitation is already pending');
    return this.prisma.$transaction(async (tx) => {
      const inv = await tx.campaignInvitation.create({
        data: {
          campaignId: c.id,
          businessId,
          creatorId: creator.id,
          message: dto.message,
          invitedBy: p.userId,
          campaignConfigVersion: c.configVersion,
          expiresAt: new Date(Date.now() + (dto.expiresInDays ?? 14) * 86400000),
        },
      });
      await this.audit.record({ actorUserId: p.userId, businessId, action: 'invitation.sent', objectType: 'campaign_invitation', objectId: inv.id }, tx);
      await this.outbox.enqueue(tx, { eventType: 'InvitationSent', aggregateType: 'campaign_invitation', aggregateId: inv.id, businessId, payload: { invitationId: inv.id, creatorId: creator.id, campaignId: c.id } });
      return inv;
    });
  }

  async creatorInvitations(p: Principal) {
    const creatorId = this.access.creatorId(p, 'creator.marketplace.use');
    return this.prisma.campaignInvitation.findMany({
      where: { creatorId },
      include: { campaign: { select: { id: true, name: true, status: true } }, business: { select: { id: true, displayName: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async businessInvitations(p: Principal, businessId: string) {
    this.access.businessAccess(p, businessId, 'application.review');
    return this.prisma.campaignInvitation.findMany({
      where: { businessId },
      include: { campaign: { select: { id: true, name: true } }, creator: { select: { id: true, handle: true, displayName: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async respondToInvitation(p: Principal, id: string, decision: 'accepted' | 'declined') {
    const creatorId = this.access.creatorId(p, 'creator.marketplace.use');
    const inv = await this.prisma.campaignInvitation.findFirst({ where: { id, creatorId } });
    if (!inv) throw notFound('Invitation');
    if (inv.status === 'pending' && inv.expiresAt && inv.expiresAt <= new Date()) {
      await this.prisma.campaignInvitation.update({ where: { id }, data: { status: 'expired' } });
      throw ruleViolation('This invitation has expired');
    }
    assertTransition(InvitationMachine, inv.status as InvitationStatus, decision);
    const c = await this.campaigns.load(inv.campaignId);
    return this.prisma.$transaction(async (tx) => {
      const r = await tx.campaignInvitation.updateMany({ where: { id, status: 'pending' }, data: { status: decision, respondedAt: new Date() } });
      if (r.count === 0) throw new ApiError('VERSION_CONFLICT', 'This invitation was already handled');
      await this.audit.record({ actorUserId: p.userId, businessId: inv.businessId, action: `invitation.${decision}`, objectType: 'campaign_invitation', objectId: id }, tx);
      if (decision === 'declined') return { invitation: await tx.campaignInvitation.findUniqueOrThrow({ where: { id } }) };
      if (!['published', 'active', 'paused'].includes(c.status)) throw ruleViolation('This campaign is no longer running');
      await this.factory.lockCampaign(tx, c.id);
      const fresh = await this.campaigns.load(c.id);
      await this.factory.assertCapacity(tx, fresh);
      // The creator accepts the current terms at this moment, so the partnership is active immediately.
      const created = await this.factory.create(tx, fresh, { creatorId, acceptedByUserId: p.userId, invitationId: id, status: 'active' });
      await tx.campaignApplication.updateMany({ where: { campaignId: c.id, creatorId, status: { in: ['pending', 'waitlisted'] } }, data: { status: 'accepted', reviewedAt: new Date(), waitlistPosition: null } });
      return { invitation: await tx.campaignInvitation.findUniqueOrThrow({ where: { id } }), partnership: created.partnership, assets: created.assets };
    });
  }

  async revokeInvitation(p: Principal, id: string) {
    const inv = await this.prisma.campaignInvitation.findUnique({ where: { id } });
    if (!inv) throw notFound('Invitation');
    this.access.businessAccess(p, inv.businessId, 'application.review');
    assertTransition(InvitationMachine, inv.status as InvitationStatus, 'revoked');
    return this.prisma.$transaction(async (tx) => {
      await tx.campaignInvitation.update({ where: { id }, data: { status: 'revoked' } });
      await this.audit.record({ actorUserId: p.userId, businessId: inv.businessId, action: 'invitation.revoked', objectType: 'campaign_invitation', objectId: id }, tx);
      return tx.campaignInvitation.findUniqueOrThrow({ where: { id } });
    });
  }
}

export type { CampaignWithRelations };
