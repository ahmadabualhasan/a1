import { Inject, Injectable } from '@nestjs/common';
import type { Prisma, PrismaClient } from '@codek/database';
import { assertTransition, PartnershipMachine, type PartnershipStatus } from '@codek/domain';
import { PRISMA } from '../../prisma/prisma.service';
import { AccessService } from '../../access/access.service';
import { AuditService } from '../../audit/audit.service';
import { ApiError, notFound, ruleViolation } from '../../common/errors';
import { page, type Pagination } from '../../common/pagination';
import type { Principal } from '../../auth/principal';
import { PromotionService } from '../promotion/promotion.service';

@Injectable()
export class PartnershipsService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly promotion: PromotionService,
  ) {}

  private listInclude = {
    campaign: { select: { id: true, name: true, status: true, currency: true, endAt: true } },
    business: { select: { id: true, displayName: true } },
    creator: { select: { id: true, handle: true, displayName: true } },
    promotionCodes: { select: { id: true, code: true, status: true, usageCount: true } },
  } satisfies Prisma.PartnershipInclude;

  async creatorPartnerships(p: Principal, q: Pagination & { status?: string }) {
    const creatorId = this.access.creatorId(p);
    const where: Prisma.PartnershipWhereInput = { creatorId, ...(q.status ? { status: q.status as PartnershipStatus } : {}) };
    const [items, total] = await Promise.all([
      this.prisma.partnership.findMany({ where, include: this.listInclude, orderBy: { createdAt: 'desc' }, take: q.limit, skip: q.offset }),
      this.prisma.partnership.count({ where }),
    ]);
    return page(items, total, q);
  }

  async businessPartnerships(p: Principal, businessId: string, q: Pagination & { status?: string; campaignId?: string }) {
    this.access.businessAccess(p, businessId, 'partnership.read');
    const where: Prisma.PartnershipWhereInput = { businessId, ...(q.status ? { status: q.status as PartnershipStatus } : {}), ...(q.campaignId ? { campaignId: q.campaignId } : {}) };
    const [items, total] = await Promise.all([
      this.prisma.partnership.findMany({ where, include: this.listInclude, orderBy: { createdAt: 'desc' }, take: q.limit, skip: q.offset }),
      this.prisma.partnership.count({ where }),
    ]);
    return page(items, total, q);
  }

  async detail(p: Principal, id: string) {
    const ps = await this.prisma.partnership.findUnique({
      where: { id },
      include: {
        ...this.listInclude,
        snapshots: { orderBy: { version: 'asc' } },
        referralLinks: { select: { id: true, token: true, status: true, destinationUrl: true } },
        qrAssets: { select: { id: true, status: true, assetFileId: true } },
        deliverables: { orderBy: { createdAt: 'asc' } },
        contentRights: true,
        events: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!ps) throw notFound('Partnership');
    const role = this.access.partnershipParty(p, ps);
    return { ...ps, viewerRole: role, links: ps.referralLinks.map((l) => ({ ...l, url: this.promotion.trackingUrl(l.token) })) };
  }

  /** Creator confirms updated terms on a pending partnership (terms changed after application). */
  async confirm(p: Principal, id: string) {
    const creatorId = this.access.creatorId(p);
    const ps = await this.prisma.partnership.findFirst({ where: { id, creatorId }, include: { campaign: true } });
    if (!ps) throw notFound('Partnership');
    assertTransition(PartnershipMachine, ps.status as PartnershipStatus, 'active');
    return this.prisma.$transaction(async (tx) => {
      await tx.partnership.update({ where: { id }, data: { status: 'active', acceptedAt: new Date(), version: { increment: 1 } } });
      if (ps.campaign.status === 'active') await this.promotion.setPartnershipAssetsStatus(tx, id, 'active');
      await tx.partnershipEvent.create({ data: { partnershipId: id, eventType: 'accepted', actorUserId: p.userId, data: { confirmedTerms: ps.termsSnapshotId } } });
      await this.audit.record({ actorUserId: p.userId, businessId: ps.businessId, action: 'partnership.terms_confirmed', objectType: 'partnership', objectId: id }, tx);
      return tx.partnership.findUniqueOrThrow({ where: { id } });
    });
  }

  async changeStatus(p: Principal, id: string, to: 'paused' | 'active' | 'completed' | 'terminated' | 'cancelled', reason?: string) {
    const ps = await this.prisma.partnership.findUnique({ where: { id }, include: { campaign: true } });
    if (!ps) throw notFound('Partnership');
    const role = this.access.partnershipParty(p, ps, 'partnership.manage');
    // Creators may only cancel a partnership that has not started; operational control stays with the business.
    if (role === 'creator' && !(to === 'cancelled' && ps.status === 'pending')) throw new ApiError('FORBIDDEN', 'Only the business can change this partnership');
    assertTransition(PartnershipMachine, ps.status as PartnershipStatus, to);
    if (to === 'active' && ps.campaign.status !== 'active') throw ruleViolation('The campaign is not active');
    return this.prisma.$transaction(async (tx) => {
      const r = await tx.partnership.updateMany({ where: { id, status: ps.status }, data: { status: to, version: { increment: 1 }, ...(['completed', 'terminated', 'cancelled'].includes(to) ? { endedAt: new Date() } : {}) } });
      if (r.count === 0) throw new ApiError('VERSION_CONFLICT', 'The partnership changed concurrently, reload and retry');
      const assetStatus = to === 'paused' ? 'paused' : to === 'active' ? 'active' : to === 'terminated' || to === 'cancelled' ? 'revoked' : 'expired';
      await this.promotion.setPartnershipAssetsStatus(tx, id, assetStatus);
      await tx.partnershipEvent.create({ data: { partnershipId: id, eventType: `partnership_${to}`, actorUserId: p.userId, data: { reason: reason ?? null } } });
      await this.audit.record({ actorUserId: p.userId, businessId: ps.businessId, action: `partnership.${to}`, objectType: 'partnership', objectId: id, before: { status: ps.status }, after: { status: to }, reason }, tx);
      if (to === 'completed' || to === 'terminated' || to === 'cancelled') {
        await tx.conversation.updateMany({ where: { partnershipId: id }, data: { status: 'closed' } });
      }
      return tx.partnership.findUniqueOrThrow({ where: { id } });
    });
  }
}
