import { Inject, Injectable } from '@nestjs/common';
import type { PrismaClient } from '@codek/database';
import { PRISMA } from '../../prisma/prisma.service';
import { AccessService } from '../../access/access.service';
import { AuditService } from '../../audit/audit.service';
import { ApiError, notFound } from '../../common/errors';
import { assertVersionUpdated } from '../../common/optimistic';
import { slugify } from '../../common/validation';
import type { Principal } from '../../auth/principal';
import type { CreateBusinessDto, UpdateBusinessDto, VerificationRequestDto } from './businesses.dto';

export const BUSINESS_PUBLIC_SELECT = {
  id: true,
  displayName: true,
  slug: true,
  category: true,
  description: true,
  country: true,
  city: true,
  websiteUrl: true,
  logoFileId: true,
  verificationStatus: true,
} as const;

@Injectable()
export class BusinessesService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly access: AccessService,
    private readonly audit: AuditService,
  ) {}

  async create(p: Principal, dto: CreateBusinessDto) {
    this.access.requireAccountType(p, 'business');
    const hosts = new Set(dto.allowedDestinationHosts ?? []);
    if (dto.websiteUrl) hosts.add(new URL(dto.websiteUrl).hostname.toLowerCase());
    const slug = await this.uniqueSlug(dto.displayName);
    const ownerRole = await this.prisma.role.findUniqueOrThrow({ where: { name: 'business_owner' } });
    return this.prisma.$transaction(async (tx) => {
      const business = await tx.business.create({
        data: {
          ownerUserId: p.userId,
          legalName: dto.legalName,
          displayName: dto.displayName,
          slug,
          category: dto.category,
          description: dto.description,
          country: dto.country,
          city: dto.city,
          timezone: dto.timezone,
          websiteUrl: dto.websiteUrl,
          allowedDestinationHosts: [...hosts],
          onboardingComplete: true,
        },
      });
      await tx.businessMember.create({ data: { businessId: business.id, userId: p.userId, roleId: ownerRole.id, status: 'active' } });
      await this.audit.record({ actorUserId: p.userId, businessId: business.id, action: 'business.created', objectType: 'business', objectId: business.id, after: business }, tx);
      return business;
    });
  }

  async listMine(p: Principal) {
    const ids = [...p.businesses.keys()];
    const rows = await this.prisma.business.findMany({ where: { id: { in: ids } }, orderBy: { createdAt: 'asc' } });
    return rows.map((b) => ({ ...b, myRole: p.businesses.get(b.id)?.role }));
  }

  async get(p: Principal, id: string) {
    this.access.businessAccess(p, id, 'business.profile.read');
    const b = await this.prisma.business.findUnique({ where: { id } });
    if (!b) throw notFound('Business');
    return { ...b, myRole: p.businesses.get(id)?.role };
  }

  async update(p: Principal, id: string, dto: UpdateBusinessDto) {
    this.access.businessAccess(p, id, 'business.profile.update');
    const before = await this.prisma.business.findUnique({ where: { id } });
    if (!before) throw notFound('Business');
    const { version, ...changes } = dto;
    return this.prisma.$transaction(async (tx) => {
      const r = await tx.business.updateMany({ where: { id, version }, data: { ...changes, version: { increment: 1 } } });
      assertVersionUpdated(r.count);
      const after = await tx.business.findUniqueOrThrow({ where: { id } });
      await this.audit.record({ actorUserId: p.userId, businessId: id, action: 'business.updated', objectType: 'business', objectId: id, before, after }, tx);
      return after;
    });
  }

  async requestVerification(p: Principal, id: string, dto: VerificationRequestDto) {
    this.access.businessAccess(p, id, 'business.profile.update');
    const b = await this.prisma.business.findUniqueOrThrow({ where: { id } });
    if (!['unverified', 'expired', 'suspended'].includes(b.verificationStatus)) {
      throw new ApiError('INVALID_STATE_TRANSITION', 'Verification is already pending or complete');
    }
    return this.prisma.$transaction(async (tx) => {
      const c = await tx.verificationCase.create({
        data: { subjectType: 'business', subjectId: id, status: 'pending', submittedBy: p.userId, evidenceJson: { ...dto } },
      });
      await tx.business.update({ where: { id }, data: { verificationStatus: 'pending' } });
      await this.audit.record({ actorUserId: p.userId, businessId: id, action: 'business.verification_requested', objectType: 'verification_case', objectId: c.id }, tx);
      return c;
    });
  }

  async members(p: Principal, id: string) {
    this.access.businessAccess(p, id, 'business.profile.read');
    const rows = await this.prisma.businessMember.findMany({
      where: { businessId: id },
      include: { user: { select: { id: true, name: true, email: true } }, role: { select: { name: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((m) => ({ id: m.id, status: m.status, role: m.role.name, user: m.user, createdAt: m.createdAt }));
  }

  async inviteMember(p: Principal, id: string, email: string, roleName: string) {
    this.access.businessAccess(p, id, 'business.members.manage');
    const user = await this.prisma.user.findUnique({ where: { email } });
    // Only existing business accounts can be added (no enumeration: same response shape either way).
    if (!user || user.accountType !== 'business') {
      throw new ApiError('BUSINESS_RULE_VIOLATION', 'Ask this person to create a CODEK business account first, then invite them again');
    }
    const role = await this.prisma.role.findUniqueOrThrow({ where: { name: roleName } });
    return this.prisma.$transaction(async (tx) => {
      const m = await tx.businessMember.upsert({
        where: { businessId_userId: { businessId: id, userId: user.id } },
        update: { roleId: role.id, status: 'active' },
        create: { businessId: id, userId: user.id, roleId: role.id, status: 'active' },
      });
      await this.audit.record({ actorUserId: p.userId, businessId: id, action: 'business.member_added', objectType: 'business_member', objectId: m.id, after: { userId: user.id, role: roleName } }, tx);
      return { id: m.id, role: roleName, status: m.status };
    });
  }

  async revokeMember(p: Principal, id: string, memberId: string) {
    this.access.businessAccess(p, id, 'business.members.manage');
    const m = await this.prisma.businessMember.findFirst({ where: { id: memberId, businessId: id }, include: { role: true } });
    if (!m) throw notFound('Member');
    const business = await this.prisma.business.findUniqueOrThrow({ where: { id } });
    if (m.userId === business.ownerUserId) throw new ApiError('BUSINESS_RULE_VIOLATION', 'The business owner cannot be removed');
    return this.prisma.$transaction(async (tx) => {
      await tx.businessMember.update({ where: { id: memberId }, data: { status: 'revoked' } });
      await this.audit.record({ actorUserId: p.userId, businessId: id, action: 'business.member_revoked', objectType: 'business_member', objectId: memberId }, tx);
      return { id: memberId, status: 'revoked' };
    });
  }

  private async uniqueSlug(name: string): Promise<string> {
    const base = slugify(name);
    for (let i = 0; i < 50; i++) {
      const candidate = i === 0 ? base : `${base}-${i + 1}`;
      if (!(await this.prisma.business.findUnique({ where: { slug: candidate }, select: { id: true } }))) return candidate;
    }
    return `${base}-${Date.now().toString(36)}`;
  }
}
