import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import type { Prisma, PrismaClient, TransactionClient } from '@codek/database';
import { ACCOUNT_TYPES, assertTransition, customerTotal, Postings, VerificationMachine, type AccountType, type VerificationStatus } from '@codek/domain';
import { PRISMA } from '../../prisma/prisma.service';
import { AccessService } from '../../access/access.service';
import { AuditService } from '../../audit/audit.service';
import { SettingsService } from '../../settings/settings.service';
import { ApiError, notFound, ruleViolation } from '../../common/errors';
import { page, type Pagination } from '../../common/pagination';
import type { Principal } from '../../auth/principal';
import { amountsOf, CommissionService } from '../finance/commission.service';
import { LedgerService } from '../finance/ledger.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AdminActionsService } from './admin-actions.service';

@Injectable()
export class AdminService implements OnModuleInit {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
    private readonly ledger: LedgerService,
    private readonly commissions: CommissionService,
    private readonly actions: AdminActionsService,
    private readonly notifications: NotificationsService,
  ) {}

  onModuleInit(): void {
    this.actions.register('ledger.manual_adjustment', {
      requestPermission: 'admin.finance.operate',
      approvePermission: 'admin.finance.approve',
      dualApproval: async (payload) => {
        const t = await this.settings.get<{ default: number }>('admin.dual_approval_threshold_minor', { default: 0 });
        return BigInt(payload.amountMinor as number) >= BigInt(t.default ?? 0);
      },
      handler: async (tx, action) => {
        const pl = action.payloadJson as { accountType: AccountType; ownerId: string | null; currency: string; direction: 'debit' | 'credit'; amountMinor: number };
        return this.ledger.post(tx, Postings.manualAdjustment({ accountType: pl.accountType, ownerId: pl.ownerId, currency: pl.currency }, pl.direction, BigInt(pl.amountMinor)), {
          businessId: ACCOUNT_TYPES[pl.accountType].owner === 'business' ? pl.ownerId : null,
          referenceType: 'admin_action',
          referenceId: action.id,
          idempotencyKey: `admin_action:${action.id}`,
          description: `Manual adjustment: ${action.reason}`,
          createdBy: action.adminUserId,
        });
      },
    });
    this.actions.register('commission.reverse', {
      requestPermission: 'admin.finance.operate',
      approvePermission: 'admin.finance.approve',
      dualApproval: () => true,
      handler: async (tx, action) => {
        const calc = await tx.commissionCalculation.findUniqueOrThrow({ where: { id: action.targetId } });
        const conv = await tx.conversion.findUniqueOrThrow({ where: { id: calc.conversionId } });
        const total = conv.currency && conv.grossMinor != null ? customerTotal(amountsOf(conv)) : 1n;
        const r = await this.commissions.applyRefund(tx, conv, total > 0n ? total : 1n, `admin_reversal: ${action.reason}`);
        return { status: r?.status, reversedMinor: r?.reversedMinor, clawbackMinor: r?.clawbackMinor };
      },
    });
    this.actions.register('conversion.reattribute', {
      requestPermission: 'admin.conversions.manage',
      approvePermission: 'admin.finance.approve',
      dualApproval: () => true,
      handler: async (tx, action, executor) => this.reattributeInTx(tx, action.targetId, String((action.payloadJson as { partnershipId: string }).partnershipId), action.reason, executor.userId),
    });
    this.actions.register('user.grant_platform_role', {
      requestPermission: 'admin.users.manage',
      approvePermission: 'admin.users.manage',
      dualApproval: () => true,
      handler: async (tx, action) => {
        const role = await tx.role.findUniqueOrThrow({ where: { name: String((action.payloadJson as { role: string }).role) } });
        if (role.scope !== 'platform') throw ruleViolation('Only platform roles can be granted here');
        await tx.user.update({ where: { id: action.targetId }, data: { accountType: 'admin' } });
        await tx.userRole.upsert({ where: { userId_roleId: { userId: action.targetId, roleId: role.id } }, update: {}, create: { userId: action.targetId, roleId: role.id, grantedBy: action.adminUserId } });
        return { granted: role.name };
      },
    });
  }

  // ─────────────── Overview ───────────────

  async overview() {
    const [users, businesses, creators, pendingCampaigns, pendingVerifications, openFlags, openCases, openDisputes, dlq, failedPayouts, reconItems, pendingActions, pendingFundings] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.business.count(),
      this.prisma.creator.count(),
      this.prisma.campaign.count({ where: { status: 'pending_review' } }),
      this.prisma.verificationCase.count({ where: { status: 'pending' } }),
      this.prisma.fraudFlag.count({ where: { status: { in: ['open', 'reviewing'] } } }),
      this.prisma.fraudCase.count({ where: { status: { not: 'closed' } } }),
      this.prisma.dispute.count({ where: { status: { not: 'closed' } } }),
      this.prisma.webhookEvent.count({ where: { processingState: 'dead_letter' } }),
      this.prisma.payout.count({ where: { status: 'failed' } }),
      this.prisma.reconciliationItem.count({ where: { status: { not: 'matched' }, resolvedAt: null } }),
      this.prisma.adminAction.count({ where: { approvalState: 'pending' } }),
      this.prisma.merchantFunding.count({ where: { status: 'pending' } }),
    ]);
    const ledger = await this.ledger.verifyInvariants();
    return { users, businesses, creators, queues: { pendingCampaigns, pendingVerifications, openFlags, openCases, openDisputes, webhookDeadLetters: dlq, failedPayouts, unresolvedReconciliationItems: reconItems, pendingAdminApprovals: pendingActions, pendingFundings }, ledgerInvariantsOk: ledger.ok };
  }

  // ─────────────── Users ───────────────

  async users(q: Pagination & { q?: string; accountType?: string; status?: string }) {
    const where: Prisma.UserWhereInput = {
      ...(q.q ? { OR: [{ email: { contains: q.q.toLowerCase() } }, { name: { contains: q.q, mode: 'insensitive' } }] } : {}),
      ...(q.accountType ? { accountType: q.accountType as 'creator' } : {}),
      ...(q.status ? { status: q.status as 'active' } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.user.findMany({ where, select: { id: true, email: true, name: true, accountType: true, status: true, emailVerified: true, twoFactorEnabled: true, createdAt: true, lastLoginAt: true, userRoles: { select: { role: { select: { name: true } } } } }, orderBy: { createdAt: 'desc' }, take: q.limit, skip: q.offset }),
      this.prisma.user.count({ where }),
    ]);
    return page(items, total, q);
  }

  async setUserStatus(p: Principal, userId: string, status: 'active' | 'suspended', reason: string) {
    const u = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!u) throw notFound('User');
    if (u.id === p.userId) throw ruleViolation('You cannot change your own account status');
    if (u.status === 'deleted') throw ruleViolation('Deleted accounts cannot be changed');
    return this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { status } });
      if (status === 'suspended') await tx.session.deleteMany({ where: { userId } });
      await tx.adminAction.create({ data: { adminUserId: p.userId, actionType: `user.${status === 'suspended' ? 'suspend' : 'reactivate'}`, targetType: 'user', targetId: userId, reason, approvalState: 'not_required', executedAt: new Date() } });
      await this.audit.record({ actorUserId: p.userId, actorType: 'admin', action: `user.${status === 'suspended' ? 'suspended' : 'reactivated'}`, objectType: 'user', objectId: userId, before: { status: u.status }, after: { status }, reason }, tx);
      return { id: userId, status };
    });
  }

  // ─────────────── Tenants & verification ───────────────

  async businesses(q: Pagination & { q?: string; verificationStatus?: string }) {
    const where: Prisma.BusinessWhereInput = { ...(q.q ? { displayName: { contains: q.q, mode: 'insensitive' } } : {}), ...(q.verificationStatus ? { verificationStatus: q.verificationStatus as VerificationStatus } : {}) };
    const [items, total] = await Promise.all([
      this.prisma.business.findMany({ where, include: { _count: { select: { campaigns: true, partnerships: true } } }, orderBy: { createdAt: 'desc' }, take: q.limit, skip: q.offset }),
      this.prisma.business.count({ where }),
    ]);
    return page(items, total, q);
  }

  async creators(q: Pagination & { q?: string; verificationStatus?: string }) {
    const where: Prisma.CreatorWhereInput = { ...(q.q ? { OR: [{ displayName: { contains: q.q, mode: 'insensitive' } }, { handle: { contains: q.q.toLowerCase() } }] } : {}), ...(q.verificationStatus ? { verificationStatus: q.verificationStatus as VerificationStatus } : {}) };
    const [items, total] = await Promise.all([
      this.prisma.creator.findMany({ where, include: { socialAccounts: true, _count: { select: { partnerships: true } } }, orderBy: { createdAt: 'desc' }, take: q.limit, skip: q.offset }),
      this.prisma.creator.count({ where }),
    ]);
    return page(items, total, q);
  }

  async verificationCases(status = 'pending') {
    return this.prisma.verificationCase.findMany({ where: { status: status as 'pending' }, orderBy: { createdAt: 'asc' }, take: 200 });
  }

  /** Review a verification case; the subject's status follows the verification lifecycle (spec §16.3). */
  async decideVerification(p: Principal, caseId: string, decision: 'verified' | 'rejected', reason: string) {
    const c = await this.prisma.verificationCase.findUnique({ where: { id: caseId } });
    if (!c) throw notFound('Verification case');
    if (c.status !== 'pending') throw new ApiError('INVALID_STATE_TRANSITION', 'This case was already decided');
    const subjectStatus: VerificationStatus = decision === 'verified' ? 'verified' : 'unverified';
    return this.prisma.$transaction(async (tx) => {
      await this.setSubjectVerification(tx, c.subjectType, c.subjectId, subjectStatus);
      await tx.verificationCase.update({ where: { id: caseId }, data: { status: decision, reviewerUserId: p.userId, reasonCode: reason, resolvedAt: new Date() } });
      await this.audit.record({ actorUserId: p.userId, actorType: 'admin', businessId: c.subjectType === 'business' ? c.subjectId : null, action: `verification.${decision}`, objectType: c.subjectType, objectId: c.subjectId, reason }, tx);
      const userIds = c.subjectType === 'business' ? await this.notifications.businessRecipients(c.subjectId, 'business.profile.read') : await this.notifications.creatorUser(c.subjectId);
      await this.notifications.notify({ userIds, type: 'verification.updated', title: decision === 'verified' ? 'You are verified' : 'Verification update', body: decision === 'verified' ? 'Your account is now verified on CODEK.' : `We could not verify your account yet: ${reason}`, dedupeKey: `verification:${caseId}` });
      return tx.verificationCase.findUniqueOrThrow({ where: { id: caseId } });
    });
  }

  async setVerificationStatus(p: Principal, subjectType: 'business' | 'creator', subjectId: string, status: 'suspended' | 'expired' | 'verified', reason: string) {
    return this.prisma.$transaction(async (tx) => {
      await this.setSubjectVerification(tx, subjectType, subjectId, status);
      await this.audit.record({ actorUserId: p.userId, actorType: 'admin', businessId: subjectType === 'business' ? subjectId : null, action: `verification.status_${status}`, objectType: subjectType, objectId: subjectId, reason }, tx);
      return { subjectType, subjectId, verificationStatus: status };
    });
  }

  private async setSubjectVerification(tx: TransactionClient, type: string, id: string, to: VerificationStatus) {
    const current = type === 'business' ? (await tx.business.findUnique({ where: { id } }))?.verificationStatus : (await tx.creator.findUnique({ where: { id } }))?.verificationStatus;
    if (!current) throw notFound('Verification subject');
    if (current !== to) assertTransition(VerificationMachine, current as VerificationStatus, to);
    if (type === 'business') await tx.business.update({ where: { id }, data: { verificationStatus: to } });
    else await tx.creator.update({ where: { id }, data: { verificationStatus: to } });
  }

  /** Mark social metrics as verified after reviewing evidence (connector-based sync is NOT CONFIGURED). */
  async verifySocialAccount(p: Principal, id: string, metrics: { followerCount?: number; averageViews?: number; engagementRate?: string }, evidence: string) {
    const s = await this.prisma.socialAccount.findUnique({ where: { id } });
    if (!s) throw notFound('Social account');
    const updated = await this.prisma.socialAccount.update({
      where: { id },
      data: {
        verificationState: 'verified',
        followerCount: metrics.followerCount != null ? BigInt(metrics.followerCount) : s.followerCount,
        averageViews: metrics.averageViews != null ? BigInt(metrics.averageViews) : s.averageViews,
        engagementRate: metrics.engagementRate ?? s.engagementRate,
        metricDefinitionVersion: 'admin-verified-v1',
        sourcePlatformVersion: 'codek_admin_review',
        fetchedAt: new Date(),
      },
    });
    await this.audit.record({ actorUserId: p.userId, actorType: 'admin', action: 'social_account.verified', objectType: 'social_account', objectId: id, before: s, after: updated, reason: evidence });
    return updated;
  }

  // ─────────────── Operations lists ───────────────

  async campaigns(q: Pagination & { status?: string }) {
    const where: Prisma.CampaignWhereInput = q.status ? { status: q.status as 'draft' } : {};
    const [items, total] = await Promise.all([
      this.prisma.campaign.findMany({ where, include: { business: { select: { displayName: true, verificationStatus: true } }, _count: { select: { partnerships: true, applications: true } } }, orderBy: { updatedAt: 'desc' }, take: q.limit, skip: q.offset }),
      this.prisma.campaign.count({ where }),
    ]);
    return page(items, total, q);
  }

  async partnerships(q: Pagination & { status?: string }) {
    const where: Prisma.PartnershipWhereInput = q.status ? { status: q.status as 'active' } : {};
    const [items, total] = await Promise.all([
      this.prisma.partnership.findMany({ where, include: { campaign: { select: { name: true } }, business: { select: { displayName: true } }, creator: { select: { handle: true } } }, orderBy: { createdAt: 'desc' }, take: q.limit, skip: q.offset }),
      this.prisma.partnership.count({ where }),
    ]);
    return page(items, total, q);
  }

  async conversions(q: Pagination & { status?: string; needsReview?: boolean; verifiedState?: string }) {
    const where: Prisma.ConversionWhereInput = { ...(q.status ? { status: q.status as 'approved' } : {}), ...(q.needsReview ? { OR: [{ reviewReason: { not: null } }, { verifiedState: 'self_reported', status: 'attributed' }] } : {}), ...(q.verifiedState ? { verifiedState: q.verifiedState as 'verified' } : {}) };
    const [items, total] = await Promise.all([
      this.prisma.conversion.findMany({ where, include: { commission: { select: { id: true, status: true, commissionMinor: true, currency: true, onHold: true } } }, orderBy: { createdAt: 'desc' }, take: q.limit, skip: q.offset }),
      this.prisma.conversion.count({ where }),
    ]);
    return page(items.map(({ customerRefHash: _c, ...rest }) => rest), total, q);
  }

  async payouts(q: Pagination & { status?: string }) {
    const where: Prisma.PayoutWhereInput = q.status ? { status: q.status as 'failed' } : {};
    const [items, total] = await Promise.all([
      this.prisma.payout.findMany({ where, include: { attempts: true, creator: { select: { handle: true } } }, orderBy: { createdAt: 'desc' }, take: q.limit, skip: q.offset }),
      this.prisma.payout.count({ where }),
    ]);
    return page(items.map((p) => ({ ...p, payoutMethodSnapshot: p.payoutMethodSnapshot ? { type: (p.payoutMethodSnapshot as { type?: string }).type } : null })), total, q);
  }

  async fundings(q: Pagination & { status?: string }) {
    const where: Prisma.MerchantFundingWhereInput = q.status ? { status: q.status as 'pending' } : {};
    const [items, total] = await Promise.all([
      this.prisma.merchantFunding.findMany({ where, include: { business: { select: { displayName: true } } }, orderBy: { createdAt: 'desc' }, take: q.limit, skip: q.offset }),
      this.prisma.merchantFunding.count({ where }),
    ]);
    return page(items, total, q);
  }

  async webhookEvents(q: Pagination & { state?: string; provider?: string }) {
    const where: Prisma.WebhookEventWhereInput = { ...(q.state ? { processingState: q.state as 'dead_letter' } : {}), ...(q.provider ? { provider: q.provider } : {}) };
    const [items, total] = await Promise.all([
      this.prisma.webhookEvent.findMany({ where, select: { id: true, provider: true, businessId: true, integrationId: true, eventType: true, providerEventId: true, signatureValid: true, replayCheckPassed: true, processingState: true, retryCount: true, lastErrorCode: true, lastErrorMessage: true, receivedAt: true, processedAt: true }, orderBy: { receivedAt: 'desc' }, take: q.limit, skip: q.offset }),
      this.prisma.webhookEvent.count({ where }),
    ]);
    return page(items, total, q);
  }

  async integrations() {
    return this.prisma.integration.findMany({ orderBy: { createdAt: 'desc' }, take: 500, select: { id: true, businessId: true, provider: true, status: true, environment: true, healthStatus: true, lastSuccessAt: true, lastErrorCode: true, createdAt: true } });
  }

  async reconciliations(q: Pagination) {
    const [items, total] = await Promise.all([this.prisma.reconciliation.findMany({ orderBy: { startedAt: 'desc' }, take: q.limit, skip: q.offset }), this.prisma.reconciliation.count()]);
    return page(items, total, q);
  }

  // ─────────────── Ledger ───────────────

  async ledgerBalances(ownerType: 'platform' | 'business' | 'creator', ownerId: string | null) {
    return this.ledger.ownerBalances(this.prisma, ownerType, ownerId);
  }

  async ledgerEntries(q: Pagination & { referenceType?: string; referenceId?: string; businessId?: string }) {
    const where: Prisma.LedgerEntryWhereInput = { ...(q.referenceType ? { referenceType: q.referenceType } : {}), ...(q.referenceId ? { referenceId: q.referenceId } : {}), ...(q.businessId ? { businessId: q.businessId } : {}) };
    const [items, total] = await Promise.all([
      this.prisma.ledgerEntry.findMany({ where, include: { lines: { include: { account: { select: { accountType: true, ownerType: true, ownerId: true } } }, orderBy: { lineOrder: 'asc' } } }, orderBy: { createdAt: 'desc' }, take: q.limit, skip: q.offset }),
      this.prisma.ledgerEntry.count({ where }),
    ]);
    return page(items, total, q);
  }

  // ─────────────── Re-attribution (dual approved) ───────────────

  private async reattributeInTx(tx: TransactionClient, conversionId: string, partnershipId: string, reason: string, actorUserId: string) {
    const conv = await tx.conversion.findUniqueOrThrow({ where: { id: conversionId } });
    if (await tx.commissionCalculation.findUnique({ where: { conversionId } })) throw ruleViolation('This conversion already has a commission; reverse it first');
    const ps = await tx.partnership.findUniqueOrThrow({ where: { id: partnershipId } });
    if (ps.businessId !== conv.businessId) throw ruleViolation('Partnership belongs to another business');
    const previous = conv.attributionDecisionId ? await tx.attributionDecision.findUnique({ where: { id: conv.attributionDecisionId } }) : null;
    const decision = await tx.attributionDecision.create({
      data: {
        businessId: conv.businessId,
        conversionId,
        selectedPartnershipId: ps.id,
        selectedCreatorId: ps.creatorId,
        method: 'manual_review',
        policyId: previous?.policyId ?? 'manual',
        policyVersion: previous?.policyVersion ?? 'manual',
        model: previous?.model ?? 'manual',
        windowSeconds: previous?.windowSeconds ?? null,
        competingTouchpoints: previous?.competingTouchpoints ?? undefined,
        conflictState: previous?.conflictState ?? 'none',
        dedupeState: 'unique',
        decisionState: 'attributed',
        reason: `MANUAL_REVIEW: ${reason}`.slice(0, 500),
        supersedesId: previous?.id ?? null,
        decidedBy: actorUserId,
      },
    });
    await tx.conversion.update({ where: { id: conversionId }, data: { attributionDecisionId: decision.id, partnershipId: ps.id, creatorId: ps.creatorId, campaignId: ps.campaignId, status: conv.status === 'validated' ? 'attributed' : conv.status } });
    const fresh = await tx.conversion.findUniqueOrThrow({ where: { id: conversionId } });
    const { calc, reviewReason } = await this.commissions.calculate(tx, fresh, ps.id);
    return { decisionId: decision.id, commissionId: calc?.id ?? null, reviewReason: reviewReason ?? null };
  }

  // ─────────────── Settings ───────────────

  async settingsList() {
    return this.prisma.systemSetting.findMany({ orderBy: { key: 'asc' } });
  }

  async updateSetting(p: Principal, key: string, value: unknown, enabled: boolean, reason: string) {
    const before = await this.prisma.systemSetting.findUnique({ where: { key } });
    if (!before) throw notFound('Setting');
    const after = await this.prisma.systemSetting.update({ where: { key }, data: { valueJson: value as Prisma.InputJsonValue, enabled, updatedBy: p.userId } });
    await this.audit.record({ actorUserId: p.userId, actorType: 'admin', action: 'settings.updated', objectType: 'system_setting', objectId: null, before, after, reason });
    this.settings.invalidate(key);
    return after;
  }

  // ─────────────── Audit ───────────────

  async auditLogs(q: Pagination & { objectType?: string; objectId?: string; actorUserId?: string; businessId?: string; action?: string }) {
    const where: Prisma.AuditLogWhereInput = {
      ...(q.objectType ? { objectType: q.objectType } : {}),
      ...(q.objectId ? { objectId: q.objectId } : {}),
      ...(q.actorUserId ? { actorUserId: q.actorUserId } : {}),
      ...(q.businessId ? { tenantBusinessId: q.businessId } : {}),
      ...(q.action ? { action: { startsWith: q.action } } : {}),
    };
    const [items, total] = await Promise.all([this.prisma.auditLog.findMany({ where, orderBy: { seq: 'desc' }, take: q.limit, skip: q.offset }), this.prisma.auditLog.count({ where })]);
    return page(items, total, q);
  }

  async verifyAuditChain() {
    const rows = await this.prisma.$queryRawUnsafe<Array<{ broken: bigint | null }>>('SELECT codek_verify_audit_chain() AS broken');
    const broken = rows[0]?.broken;
    return { intact: broken == null, firstBrokenSeq: broken ?? null, checkedAt: new Date() };
  }

  ensure(p: Principal): void {
    this.access.platform(p, 'admin.access');
  }
}
