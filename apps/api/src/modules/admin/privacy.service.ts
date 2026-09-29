import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import type { PrismaClient } from '@codek/database';
import { PRISMA } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { ApiError, notFound } from '../../common/errors';
import type { Principal } from '../../auth/principal';
import { AdminActionsService } from './admin-actions.service';

/**
 * Data-subject rights workflows (spec §14.1-14.2, Jordan PDPL): access/export, rectification, deletion.
 * Deletion anonymizes identity data; financial and audit records are retained where legally required (never
 * hard-deleted). Anonymization is a dual-approved admin action.
 */
@Injectable()
export class PrivacyService implements OnModuleInit {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly audit: AuditService,
    private readonly actions: AdminActionsService,
  ) {}

  onModuleInit(): void {
    this.actions.register('user.anonymize', {
      requestPermission: 'admin.users.manage',
      approvePermission: 'admin.users.manage',
      dualApproval: () => true,
      handler: async (tx, action) => {
        const userId = action.targetId;
        const anon = `deleted-${userId.slice(0, 8)}@anonymized.invalid`;
        await tx.user.update({ where: { id: userId }, data: { email: anon, name: 'Deleted user', image: null, status: 'deleted', emailVerified: false } });
        await tx.session.deleteMany({ where: { userId } });
        await tx.account.updateMany({ where: { userId }, data: { password: null, accessToken: null, refreshToken: null, idToken: null } });
        await tx.twoFactor.deleteMany({ where: { userId } });
        const creator = await tx.creator.findUnique({ where: { userId } });
        if (creator) {
          await tx.creator.update({ where: { id: creator.id }, data: { displayName: 'Deleted creator', bio: null, city: null, portfolioUrls: [], payoutMethod: undefined, avatarFileId: null } });
          await tx.socialAccount.deleteMany({ where: { creatorId: creator.id } });
        }
        await tx.notification.deleteMany({ where: { userId } });
        return { anonymized: true, retained: ['ledger', 'commissions', 'payouts', 'audit_logs', 'legal_acceptances'] };
      },
    });
  }

  async create(p: Principal, requestType: 'access' | 'deletion' | 'rectification' | 'portability', details?: string) {
    const r = await this.prisma.dataSubjectRequest.create({ data: { userId: p.userId, requestType, details } });
    await this.audit.record({ actorUserId: p.userId, action: 'privacy.request_created', objectType: 'data_subject_request', objectId: r.id, after: { requestType } });
    return r;
  }

  async mine(p: Principal) {
    return this.prisma.dataSubjectRequest.findMany({ where: { userId: p.userId }, orderBy: { createdAt: 'desc' } });
  }

  /** Machine-readable export of the caller's own personal data (access/portability). */
  async export(p: Principal) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: p.userId }, select: { id: true, email: true, name: true, accountType: true, createdAt: true, lastLoginAt: true } });
    const creator = await this.prisma.creator.findUnique({ where: { userId: p.userId }, include: { socialAccounts: true, applications: true, partnerships: { select: { id: true, campaignId: true, status: true, createdAt: true } }, payouts: { select: { id: true, amountMinor: true, currency: true, status: true, requestedAt: true } } } });
    const memberships = await this.prisma.businessMember.findMany({ where: { userId: p.userId }, select: { businessId: true, status: true, role: { select: { name: true } } } });
    const acceptances = await this.prisma.legalAcceptance.findMany({ where: { userId: p.userId }, include: { legalDocument: { select: { documentType: true, version: true } } } });
    const notifications = await this.prisma.notification.findMany({ where: { userId: p.userId }, select: { type: true, title: true, createdAt: true } });
    await this.audit.record({ actorUserId: p.userId, action: 'privacy.export_downloaded', objectType: 'user', objectId: p.userId });
    return { generatedAt: new Date(), user, creator, businessMemberships: memberships, legalAcceptances: acceptances, notifications };
  }

  async adminList(status?: string) {
    return this.prisma.dataSubjectRequest.findMany({ where: status ? { status } : {}, orderBy: { createdAt: 'asc' }, take: 200 });
  }

  async complete(p: Principal, id: string, note: string) {
    const r = await this.prisma.dataSubjectRequest.findUnique({ where: { id } });
    if (!r) throw notFound('Request');
    if (r.status === 'completed') throw new ApiError('CONFLICT', 'Already completed');
    const done = await this.prisma.dataSubjectRequest.update({ where: { id }, data: { status: 'completed', handledBy: p.userId, resultNote: note, completedAt: new Date() } });
    await this.audit.record({ actorUserId: p.userId, actorType: 'admin', action: 'privacy.request_completed', objectType: 'data_subject_request', objectId: id, reason: note });
    return done;
  }
}
