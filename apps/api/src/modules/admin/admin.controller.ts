import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { ACCOUNT_TYPES } from '@codek/domain';
import { AllowUnverified, CurrentPrincipal, RequirePlatformPermission } from '../../auth/decorators';
import type { Principal } from '../../auth/principal';
import { paginationSchema } from '../../common/pagination';
import { currencyCode, positiveMinor } from '../../common/validation';
import { FraudService } from '../fraud/fraud.service';
import { AdminActionsService } from './admin-actions.service';
import { AdminService } from './admin.service';
import { PrivacyService } from './privacy.service';

const reason = z.string().trim().min(3).max(2000);
class ReasonDto extends createZodDto(z.object({ reason })) {}
class PageDto extends createZodDto(paginationSchema.extend({ q: z.string().max(100).optional(), status: z.string().max(40).optional(), accountType: z.string().max(20).optional(), verificationStatus: z.string().max(20).optional(), state: z.string().max(40).optional(), provider: z.string().max(40).optional(), severity: z.string().max(20).optional(), needsReview: z.enum(['true', 'false']).transform((v) => v === 'true').optional(), verifiedState: z.string().max(20).optional() })) {}
class AuditQueryDto extends createZodDto(paginationSchema.extend({ objectType: z.string().max(60).optional(), objectId: z.uuid().optional(), actorUserId: z.uuid().optional(), businessId: z.uuid().optional(), action: z.string().max(80).optional() })) {}
class LedgerQueryDto extends createZodDto(paginationSchema.extend({ referenceType: z.string().max(60).optional(), referenceId: z.uuid().optional(), businessId: z.uuid().optional() })) {}
class BalancesQueryDto extends createZodDto(z.object({ ownerType: z.enum(['platform', 'business', 'creator']), ownerId: z.uuid().optional() })) {}
class DecideVerificationDto extends createZodDto(z.object({ decision: z.enum(['verified', 'rejected']), reason })) {}
class VerificationStatusDto extends createZodDto(z.object({ subjectType: z.enum(['business', 'creator']), status: z.enum(['suspended', 'expired', 'verified']), reason })) {}
class SocialVerifyDto extends createZodDto(z.object({ followerCount: z.number().int().nonnegative().optional(), averageViews: z.number().int().nonnegative().optional(), engagementRate: z.string().regex(/^\d+(\.\d{1,6})?$/).optional(), evidence: reason })) {}
class AdjustmentDto extends createZodDto(
  z.object({
    accountType: z.enum(Object.keys(ACCOUNT_TYPES) as [keyof typeof ACCOUNT_TYPES, ...Array<keyof typeof ACCOUNT_TYPES>]),
    ownerId: z.uuid().nullable(),
    currency: currencyCode,
    direction: z.enum(['debit', 'credit']),
    amountMinor: positiveMinor,
    reason,
  }),
) {}
class ReattributeDto extends createZodDto(z.object({ partnershipId: z.uuid(), reason })) {}
class RoleDto extends createZodDto(z.object({ role: z.enum(['platform_admin', 'finance_admin', 'support_agent']), reason })) {}
class SettingDto extends createZodDto(z.object({ value: z.unknown(), enabled: z.boolean().default(true), reason })) {}
class PayoutReturnedDto extends createZodDto(z.object({ reason, providerReference: z.string().trim().max(200).optional() })) {}
class CaseDto extends createZodDto(z.object({ subjectType: z.enum(['creator', 'business', 'partnership', 'conversion', 'integration']), subjectId: z.uuid(), riskLevel: z.enum(['low', 'medium', 'high', 'critical']), summary: z.string().trim().min(10).max(4000), flagIds: z.array(z.uuid()).max(100).default([]), businessId: z.uuid().optional() })) {}
class CaseTransitionDto extends createZodDto(
  z.object({ to: z.enum(['evidence', 'review', 'decision', 'closed']), reason, resolutionCode: z.enum(['no_fraud', 'confirmed_fraud', 'inconclusive']).optional(), holdCommissions: z.boolean().optional(), releaseHolds: z.boolean().optional() }),
) {}
class PrivacyRequestDto extends createZodDto(z.object({ requestType: z.enum(['access', 'deletion', 'rectification', 'portability']), details: z.string().trim().max(2000).optional() })) {}
class CompleteDto extends createZodDto(z.object({ note: reason })) {}

/** Admin console API (spec §20.8, §23.5). Every route requires a platform permission; sensitive actions are audited. */
@ApiTags('admin')
@Controller()
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly actions: AdminActionsService,
    private readonly fraud: FraudService,
    private readonly privacy: PrivacyService,
  ) {}

  @RequirePlatformPermission('admin.access')
  @Get('admin/overview')
  overview() {
    return this.admin.overview();
  }

  // Users
  @RequirePlatformPermission('admin.users.manage')
  @Get('admin/users')
  users(@Query() q: PageDto) {
    return this.admin.users(q);
  }

  @RequirePlatformPermission('admin.users.manage')
  @Post('admin/users/:id/suspend')
  @HttpCode(200)
  suspend(@CurrentPrincipal() p: Principal, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReasonDto) {
    return this.admin.setUserStatus(p, id, 'suspended', dto.reason);
  }

  @RequirePlatformPermission('admin.users.manage')
  @Post('admin/users/:id/reactivate')
  @HttpCode(200)
  reactivate(@CurrentPrincipal() p: Principal, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReasonDto) {
    return this.admin.setUserStatus(p, id, 'active', dto.reason);
  }

  @RequirePlatformPermission('admin.users.manage')
  @Post('admin/users/:id/roles')
  grantRole(@CurrentPrincipal() p: Principal, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RoleDto) {
    return this.actions.request(p, { actionType: 'user.grant_platform_role', targetType: 'user', targetId: id, reason: dto.reason, payload: { role: dto.role } });
  }

  @RequirePlatformPermission('admin.users.manage')
  @Post('admin/users/:id/anonymize')
  anonymize(@CurrentPrincipal() p: Principal, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReasonDto) {
    return this.actions.request(p, { actionType: 'user.anonymize', targetType: 'user', targetId: id, reason: dto.reason, payload: {} });
  }

  // Tenants & verification
  @RequirePlatformPermission('admin.tenants.manage')
  @Get('admin/businesses')
  businesses(@Query() q: PageDto) {
    return this.admin.businesses(q);
  }

  @RequirePlatformPermission('admin.tenants.manage')
  @Get('admin/creators')
  creators(@Query() q: PageDto) {
    return this.admin.creators(q);
  }

  @RequirePlatformPermission('admin.verification.manage')
  @Get('admin/verification-cases')
  verificationCases(@Query() q: PageDto) {
    return this.admin.verificationCases(q.status ?? 'pending');
  }

  @RequirePlatformPermission('admin.verification.manage')
  @Post('admin/verification-cases/:id/decide')
  @HttpCode(200)
  decide(@CurrentPrincipal() p: Principal, @Param('id', ParseUUIDPipe) id: string, @Body() dto: DecideVerificationDto) {
    return this.admin.decideVerification(p, id, dto.decision, dto.reason);
  }

  @RequirePlatformPermission('admin.verification.manage')
  @Post('admin/verification-status/:subjectId')
  @HttpCode(200)
  verificationStatus(@CurrentPrincipal() p: Principal, @Param('subjectId', ParseUUIDPipe) subjectId: string, @Body() dto: VerificationStatusDto) {
    return this.admin.setVerificationStatus(p, dto.subjectType, subjectId, dto.status, dto.reason);
  }

  @RequirePlatformPermission('admin.verification.manage')
  @Post('admin/social-accounts/:id/verify')
  @HttpCode(200)
  verifySocial(@CurrentPrincipal() p: Principal, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SocialVerifyDto) {
    return this.admin.verifySocialAccount(p, id, dto, dto.evidence);
  }

  // Operations
  @RequirePlatformPermission('admin.campaigns.review')
  @Get('admin/campaigns')
  campaigns(@Query() q: PageDto) {
    return this.admin.campaigns(q);
  }

  @RequirePlatformPermission('admin.tenants.manage')
  @Get('admin/partnerships')
  partnerships(@Query() q: PageDto) {
    return this.admin.partnerships(q);
  }

  @RequirePlatformPermission('admin.conversions.manage')
  @Get('admin/conversions')
  conversions(@Query() q: PageDto) {
    return this.admin.conversions(q);
  }

  @RequirePlatformPermission('admin.conversions.manage')
  @Post('admin/conversions/:id/reattribute')
  reattribute(@CurrentPrincipal() p: Principal, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReattributeDto) {
    return this.actions.request(p, { actionType: 'conversion.reattribute', targetType: 'conversion', targetId: id, reason: dto.reason, payload: { partnershipId: dto.partnershipId } });
  }

  @RequirePlatformPermission('admin.finance.read')
  @Get('admin/payouts')
  payouts(@Query() q: PageDto) {
    return this.admin.payouts(q);
  }

  @RequirePlatformPermission('admin.finance.read')
  @Get('admin/fundings')
  fundings(@Query() q: PageDto) {
    return this.admin.fundings(q);
  }

  @RequirePlatformPermission('admin.integrations.manage')
  @Get('admin/webhook-events')
  webhookEvents(@Query() q: PageDto) {
    return this.admin.webhookEvents(q);
  }

  @RequirePlatformPermission('admin.integrations.manage')
  @Get('admin/integrations')
  integrations() {
    return this.admin.integrations();
  }

  @RequirePlatformPermission('admin.reconciliation.manage')
  @Get('admin/reconciliations')
  reconciliations(@Query() q: PageDto) {
    return this.admin.reconciliations(q);
  }

  // Ledger & financial operations
  @RequirePlatformPermission('admin.finance.read')
  @Get('admin/ledger/balances')
  balances(@Query() q: BalancesQueryDto) {
    return this.admin.ledgerBalances(q.ownerType, q.ownerId ?? null);
  }

  @RequirePlatformPermission('admin.finance.read')
  @Get('admin/ledger/entries')
  entries(@Query() q: LedgerQueryDto) {
    return this.admin.ledgerEntries(q);
  }

  @RequirePlatformPermission('admin.finance.operate')
  @Post('admin/ledger/adjustments')
  adjustment(@CurrentPrincipal() p: Principal, @Body() dto: AdjustmentDto) {
    const { reason: r, ...payload } = dto;
    return this.actions.request(p, { actionType: 'ledger.manual_adjustment', targetType: 'ledger_account', targetId: dto.ownerId ?? '00000000-0000-0000-0000-000000000000', reason: r, payload });
  }

  @RequirePlatformPermission('admin.finance.operate')
  @Post('admin/payouts/:id/returned')
  payoutReturned(@CurrentPrincipal() p: Principal, @Param('id', ParseUUIDPipe) id: string, @Body() dto: PayoutReturnedDto) {
    return this.actions.request(p, { actionType: 'payout.mark_returned', targetType: 'payout', targetId: id, reason: dto.reason, payload: { providerReference: dto.providerReference ?? null } });
  }

  @RequirePlatformPermission('admin.finance.operate')
  @Post('admin/commissions/:id/reverse')
  reverse(@CurrentPrincipal() p: Principal, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReasonDto) {
    return this.actions.request(p, { actionType: 'commission.reverse', targetType: 'commission_calculation', targetId: id, reason: dto.reason, payload: {} });
  }

  @RequirePlatformPermission('admin.access')
  @Get('admin/actions')
  actionList(@CurrentPrincipal() p: Principal, @Query() q: PageDto) {
    return this.actions.list(p, q.state as 'pending' | undefined);
  }

  @RequirePlatformPermission('admin.access')
  @Post('admin/actions/:id/approve')
  @HttpCode(200)
  approve(@CurrentPrincipal() p: Principal, @Param('id', ParseUUIDPipe) id: string) {
    return this.actions.approve(p, id);
  }

  @RequirePlatformPermission('admin.access')
  @Post('admin/actions/:id/reject')
  @HttpCode(200)
  rejectAction(@CurrentPrincipal() p: Principal, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReasonDto) {
    return this.actions.reject(p, id, dto.reason);
  }

  // Fraud
  @RequirePlatformPermission('admin.fraud.manage')
  @Get('admin/fraud/flags')
  flags(@Query() q: PageDto) {
    return this.fraud.flags(q);
  }

  @RequirePlatformPermission('admin.fraud.manage')
  @Post('admin/fraud/flags/:id/dismiss')
  @HttpCode(200)
  dismiss(@CurrentPrincipal() p: Principal, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReasonDto) {
    return this.fraud.dismissFlag(p, id, dto.reason);
  }

  @RequirePlatformPermission('admin.fraud.manage')
  @Get('admin/fraud/cases')
  cases(@Query() q: PageDto) {
    return this.fraud.cases(q);
  }

  @RequirePlatformPermission('admin.fraud.manage')
  @Post('admin/fraud/cases')
  openCase(@CurrentPrincipal() p: Principal, @Body() dto: CaseDto) {
    return this.fraud.openCase(p, dto);
  }

  @RequirePlatformPermission('admin.fraud.manage')
  @Get('admin/fraud/cases/:id')
  getCase(@Param('id', ParseUUIDPipe) id: string) {
    return this.fraud.getCase(id);
  }

  @RequirePlatformPermission('admin.fraud.manage')
  @Post('admin/fraud/cases/:id/transition')
  @HttpCode(200)
  caseTransition(@CurrentPrincipal() p: Principal, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CaseTransitionDto) {
    return this.fraud.transition(p, id, dto.to, dto.reason, dto.resolutionCode ? { resolutionCode: dto.resolutionCode, holdCommissions: dto.holdCommissions, releaseHolds: dto.releaseHolds } : undefined);
  }

  // Audit & settings
  @RequirePlatformPermission('admin.audit.read')
  @Get('admin/audit-logs')
  audit(@Query() q: AuditQueryDto) {
    return this.admin.auditLogs(q);
  }

  @RequirePlatformPermission('admin.audit.read')
  @Get('admin/audit-logs/verify')
  verifyAudit() {
    return this.admin.verifyAuditChain();
  }

  @RequirePlatformPermission('admin.settings.manage')
  @Get('admin/settings')
  settings() {
    return this.admin.settingsList();
  }

  @RequirePlatformPermission('admin.settings.manage')
  @Put('admin/settings/:key')
  setSetting(@CurrentPrincipal() p: Principal, @Param('key') key: string, @Body() dto: SettingDto) {
    return this.admin.updateSetting(p, key, dto.value, dto.enabled, dto.reason);
  }

  // Privacy
  @AllowUnverified()
  @Post('privacy/requests')
  privacyRequest(@CurrentPrincipal() p: Principal, @Body() dto: PrivacyRequestDto) {
    return this.privacy.create(p, dto.requestType, dto.details);
  }

  @Get('privacy/requests')
  myPrivacyRequests(@CurrentPrincipal() p: Principal) {
    return this.privacy.mine(p);
  }

  @Get('privacy/export')
  exportData(@CurrentPrincipal() p: Principal) {
    return this.privacy.export(p);
  }

  @RequirePlatformPermission('admin.users.manage')
  @Get('admin/privacy/requests')
  privacyList(@Query() q: PageDto) {
    return this.privacy.adminList(q.status);
  }

  @RequirePlatformPermission('admin.users.manage')
  @Post('admin/privacy/requests/:id/complete')
  @HttpCode(200)
  privacyComplete(@CurrentPrincipal() p: Principal, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CompleteDto) {
    return this.privacy.complete(p, id, dto.note);
  }
}
