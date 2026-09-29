import { Inject, Injectable } from '@nestjs/common';
import type { Prisma, PrismaClient } from '@codek/database';
import { PRISMA } from '../../prisma/prisma.service';
import { AccessService } from '../../access/access.service';
import { AuditService } from '../../audit/audit.service';
import { ApiError, notFound } from '../../common/errors';
import { assertVersionUpdated } from '../../common/optimistic';
import { page } from '../../common/pagination';
import type { Principal } from '../../auth/principal';
import type { CreateCreatorProfileDto, CreatorSearchDto, SocialAccountDto, UpdateCreatorProfileDto, UpdateSocialAccountDto } from './creators.dto';

/** Fields a business may see about a creator (no email, no payout details). */
const CREATOR_PUBLIC = {
  id: true,
  handle: true,
  displayName: true,
  bio: true,
  avatarFileId: true,
  country: true,
  city: true,
  languages: true,
  categories: true,
  portfolioUrls: true,
  verificationStatus: true,
  createdAt: true,
} as const;

const SOCIAL_PUBLIC = {
  id: true,
  platform: true,
  handle: true,
  profileUrl: true,
  connectionStatus: true,
  verificationState: true,
  followerCount: true,
  averageViews: true,
  engagementRate: true,
  likesAvg: true,
  commentsAvg: true,
  sourcePlatformVersion: true,
  metricDefinitionVersion: true,
  fetchedAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class CreatorsService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly access: AccessService,
    private readonly audit: AuditService,
  ) {}

  async createProfile(p: Principal, dto: CreateCreatorProfileDto) {
    this.access.requireAccountType(p, 'creator');
    if (p.creatorId) throw new ApiError('CONFLICT', 'You already have a creator profile');
    const taken = await this.prisma.creator.findUnique({ where: { handle: dto.handle }, select: { id: true } });
    if (taken) throw new ApiError('CONFLICT', 'This handle is already taken', { field: 'handle' });
    return this.prisma.$transaction(async (tx) => {
      const c = await tx.creator.create({
        data: {
          userId: p.userId,
          handle: dto.handle,
          displayName: dto.displayName,
          bio: dto.bio,
          country: dto.country,
          city: dto.city,
          languages: dto.languages ?? [],
          categories: dto.categories ?? [],
          portfolioUrls: dto.portfolioUrls ?? [],
          onboardingComplete: true,
        },
      });
      await this.audit.record({ actorUserId: p.userId, action: 'creator.created', objectType: 'creator', objectId: c.id, after: c }, tx);
      return c;
    });
  }

  async myProfile(p: Principal) {
    this.access.requireAccountType(p, 'creator');
    if (!p.creatorId) return null;
    return this.prisma.creator.findUnique({ where: { id: p.creatorId }, include: { socialAccounts: { select: SOCIAL_PUBLIC } } });
  }

  async updateProfile(p: Principal, dto: UpdateCreatorProfileDto) {
    const creatorId = this.access.creatorId(p, 'creator.profile.manage');
    const before = await this.prisma.creator.findUniqueOrThrow({ where: { id: creatorId } });
    const { version, ...changes } = dto;
    return this.prisma.$transaction(async (tx) => {
      const r = await tx.creator.updateMany({ where: { id: creatorId, version }, data: { ...changes, version: { increment: 1 } } });
      assertVersionUpdated(r.count);
      const after = await tx.creator.findUniqueOrThrow({ where: { id: creatorId } });
      await this.audit.record({ actorUserId: p.userId, action: 'creator.updated', objectType: 'creator', objectId: creatorId, before, after }, tx);
      return after;
    });
  }

  async requestVerification(p: Principal, notes?: string) {
    const creatorId = this.access.creatorId(p, 'creator.profile.manage');
    const c = await this.prisma.creator.findUniqueOrThrow({ where: { id: creatorId } });
    if (!['unverified', 'expired', 'suspended'].includes(c.verificationStatus)) {
      throw new ApiError('INVALID_STATE_TRANSITION', 'Verification is already pending or complete');
    }
    return this.prisma.$transaction(async (tx) => {
      const vc = await tx.verificationCase.create({ data: { subjectType: 'creator', subjectId: creatorId, status: 'pending', submittedBy: p.userId, evidenceJson: { notes: notes ?? null } } });
      await tx.creator.update({ where: { id: creatorId }, data: { verificationStatus: 'pending' } });
      await this.audit.record({ actorUserId: p.userId, action: 'creator.verification_requested', objectType: 'verification_case', objectId: vc.id }, tx);
      return vc;
    });
  }

  // ── Social accounts: self-reported unless verified by a connector/admin (spec §4.3 provenance) ──

  async listSocial(p: Principal) {
    const creatorId = this.access.creatorId(p, 'creator.profile.manage');
    return this.prisma.socialAccount.findMany({ where: { creatorId }, select: SOCIAL_PUBLIC, orderBy: { platform: 'asc' } });
  }

  async addSocial(p: Principal, dto: SocialAccountDto) {
    const creatorId = this.access.creatorId(p, 'creator.profile.manage');
    const exists = await this.prisma.socialAccount.findUnique({ where: { creatorId_platform: { creatorId, platform: dto.platform } } });
    if (exists) throw new ApiError('CONFLICT', 'You already added this platform; edit it instead');
    const row = await this.prisma.socialAccount.create({
      data: {
        creatorId,
        platform: dto.platform,
        handle: dto.handle,
        profileUrl: dto.profileUrl,
        followerCount: dto.followerCount != null ? BigInt(dto.followerCount) : null,
        averageViews: dto.averageViews != null ? BigInt(dto.averageViews) : null,
        engagementRate: dto.engagementRate ?? null,
        likesAvg: dto.likesAvg != null ? BigInt(dto.likesAvg) : null,
        commentsAvg: dto.commentsAvg != null ? BigInt(dto.commentsAvg) : null,
        connectionStatus: 'not_connected',
        verificationState: 'self_reported',
        metricDefinitionVersion: 'self-reported-v1',
        sourcePlatformVersion: 'self_reported',
        fetchedAt: new Date(),
      },
      select: SOCIAL_PUBLIC,
    });
    await this.audit.record({ actorUserId: p.userId, action: 'creator.social_added', objectType: 'social_account', objectId: row.id, after: row });
    return row;
  }

  async updateSocial(p: Principal, id: string, dto: UpdateSocialAccountDto) {
    const creatorId = this.access.creatorId(p, 'creator.profile.manage');
    const row = await this.prisma.socialAccount.findFirst({ where: { id, creatorId } });
    if (!row) throw notFound('Social account');
    const metricsChanged = ['followerCount', 'averageViews', 'engagementRate', 'likesAvg', 'commentsAvg'].some((k) => k in dto);
    const updated = await this.prisma.socialAccount.update({
      where: { id },
      data: {
        handle: dto.handle,
        profileUrl: dto.profileUrl,
        followerCount: dto.followerCount != null ? BigInt(dto.followerCount) : undefined,
        averageViews: dto.averageViews != null ? BigInt(dto.averageViews) : undefined,
        engagementRate: dto.engagementRate,
        likesAvg: dto.likesAvg != null ? BigInt(dto.likesAvg) : undefined,
        commentsAvg: dto.commentsAvg != null ? BigInt(dto.commentsAvg) : undefined,
        // Editing numbers by hand downgrades verified metrics to self-reported.
        ...(metricsChanged ? { verificationState: 'self_reported', sourcePlatformVersion: 'self_reported', metricDefinitionVersion: 'self-reported-v1', fetchedAt: new Date() } : {}),
      },
      select: SOCIAL_PUBLIC,
    });
    await this.audit.record({ actorUserId: p.userId, action: 'creator.social_updated', objectType: 'social_account', objectId: id, before: row, after: updated });
    return updated;
  }

  async removeSocial(p: Principal, id: string) {
    const creatorId = this.access.creatorId(p, 'creator.profile.manage');
    const row = await this.prisma.socialAccount.findFirst({ where: { id, creatorId } });
    if (!row) throw notFound('Social account');
    await this.prisma.socialAccount.delete({ where: { id } });
    await this.audit.record({ actorUserId: p.userId, action: 'creator.social_removed', objectType: 'social_account', objectId: id, before: row });
    return { id, removed: true };
  }

  // ── Business-facing creator discovery ──

  private requireAnyBusiness(p: Principal): void {
    const ok = [...p.businesses.values()].some((b) => b.permissions.has('application.review'));
    if (!ok && !p.platformPermissions.has('admin.tenants.manage')) throw new ApiError('FORBIDDEN', 'Only business teams can browse creators');
  }

  async search(p: Principal, q: CreatorSearchDto) {
    this.requireAnyBusiness(p);
    const where: Prisma.CreatorWhereInput = { onboardingComplete: true, user: { status: 'active' } };
    if (q.q) where.OR = [{ displayName: { contains: q.q, mode: 'insensitive' } }, { handle: { contains: q.q.toLowerCase() } }];
    if (q.category) where.categories = { has: q.category };
    if (q.country) where.country = q.country;
    if (q.verifiedOnly) where.verificationStatus = 'verified';
    if (q.platform || q.minFollowers != null) {
      where.socialAccounts = { some: { ...(q.platform ? { platform: q.platform } : {}), ...(q.minFollowers != null ? { followerCount: { gte: BigInt(q.minFollowers) } } : {}) } };
    }
    const [items, total] = await Promise.all([
      this.prisma.creator.findMany({ where, select: { ...CREATOR_PUBLIC, socialAccounts: { select: SOCIAL_PUBLIC } }, orderBy: { createdAt: 'desc' }, take: q.limit, skip: q.offset }),
      this.prisma.creator.count({ where }),
    ]);
    return page(items, total, q);
  }

  async publicProfile(p: Principal, id: string) {
    const isSelf = p.creatorId === id;
    if (!isSelf) this.requireAnyBusiness(p);
    const c = await this.prisma.creator.findUnique({ where: { id }, select: { ...CREATOR_PUBLIC, socialAccounts: { select: SOCIAL_PUBLIC } } });
    if (!c) throw notFound('Creator');
    return { ...c, performance: await this.performance(id) };
  }

  /** CODEK performance grounded in operational history (spec §16.2), not ratings. */
  async performance(creatorId: string) {
    const [partnerships, completed, conversions, approved, commission] = await Promise.all([
      this.prisma.partnership.count({ where: { creatorId, status: { in: ['active', 'paused', 'completed', 'disputed'] } } }),
      this.prisma.partnership.count({ where: { creatorId, status: 'completed' } }),
      this.prisma.conversion.count({ where: { creatorId, verifiedState: 'verified' } }),
      this.prisma.conversion.count({ where: { creatorId, verifiedState: 'verified', status: { in: ['approved', 'partially_refunded'] } } }),
      this.prisma.commissionCalculation.groupBy({ by: ['currency'], where: { creatorId, status: { notIn: ['reversed'] } }, _sum: { commissionMinor: true, reversedMinor: true, clawbackMinor: true } }),
    ]);
    const deliverables = await this.prisma.deliverable.groupBy({ by: ['status'], where: { partnership: { creatorId }, required: true }, _count: true });
    const totalDeliverables = deliverables.reduce((s, d) => s + d._count, 0);
    const approvedDeliverables = deliverables.find((d) => d.status === 'approved')?._count ?? 0;
    return {
      campaigns: partnerships,
      completedPartnerships: completed,
      verifiedConversions: conversions,
      approvedConversions: approved,
      completionRate: totalDeliverables ? (approvedDeliverables / totalDeliverables).toFixed(4) : null,
      commissions: commission.map((c) => ({
        currency: c.currency,
        netCommissionMinor: (c._sum.commissionMinor ?? 0n) - (c._sum.reversedMinor ?? 0n) - (c._sum.clawbackMinor ?? 0n),
      })),
      source: 'codek_verified_operations',
    };
  }
}
