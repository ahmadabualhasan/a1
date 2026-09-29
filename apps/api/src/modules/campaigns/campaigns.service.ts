import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { Campaign, Prisma, PrismaClient, TransactionClient } from '@codek/database';
import { assertAllowedDestination, assertSupportedCurrency, assertTransition, CampaignMachine, type CampaignStatus } from '@codek/domain';
import type { Env } from '@codek/config';
import { ENV } from '../../config/config.module';
import { PRISMA } from '../../prisma/prisma.service';
import { AccessService } from '../../access/access.service';
import { AuditService } from '../../audit/audit.service';
import { SettingsService } from '../../settings/settings.service';
import { ApiError, notFound, ruleViolation } from '../../common/errors';
import { page } from '../../common/pagination';
import { slugify } from '../../common/validation';
import type { Principal } from '../../auth/principal';
import { assertSupportedCompensation, ruleCreateData, validateCommissionConfig } from './campaign-rules';
import type { CampaignListQueryDto, CreateCampaignInput, MarketplaceQueryDto, UpdateCampaignInput } from './campaigns.dto';

const COMMERCIAL_FIELDS = [
  'discountConfig',
  'commission',
  'attributionPolicy',
  'holdPeriodDays',
  'conversionApprovalMode',
  'deliverables',
  'contentRights',
  'promotionRules',
  'cancellationRefundPolicy',
  'disclosureRequirements',
  'compensationType',
  'fixedFeeMinor',
] as const;

const OPEN_STATUSES: CampaignStatus[] = ['published', 'active'];

export type CampaignWithRelations = Prisma.CampaignGetPayload<{ include: { commissionRule: true; business: true; catalogItem: true; eligibilityRules: true } }>;

@Injectable()
export class CampaignsService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(ENV) private readonly env: Env,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
  ) {}

  // ─────────────── Create / update ───────────────

  async create(p: Principal, businessId: string, dto: CreateCampaignInput) {
    this.access.businessAccess(p, businessId, 'campaign.manage');
    const business = await this.prisma.business.findUniqueOrThrow({ where: { id: businessId } });
    const item = await this.prisma.catalogItem.findFirst({ where: { id: dto.catalogItemId, businessId } });
    if (!item) throw ruleViolation('Choose a product or service from your catalog', { field: 'catalogItemId' });
    await this.validate(business, dto);
    const id = randomUUID();
    const slug = await this.uniqueSlug(businessId, dto.name);
    return this.prisma.$transaction(async (tx) => {
      const rule = await tx.commissionRule.create({ data: ruleCreateData(businessId, `campaign:${id}`, 1, dto.commission, dto.currency) });
      const campaign = await tx.campaign.create({
        data: {
          id,
          businessId,
          catalogItemId: dto.catalogItemId,
          name: dto.name,
          slug,
          description: dto.description,
          category: dto.category,
          imageFileId: dto.imageFileId,
          startAt: dto.startAt,
          endAt: dto.endAt,
          timezone: dto.timezone,
          participantCap: dto.participantCap,
          creatorCapacity: dto.participantCap,
          applicationDeadlineAt: dto.applicationDeadlineAt,
          waitlistEnabled: dto.waitlistEnabled,
          compensationType: dto.compensationType,
          productServiceProvided: dto.productServiceProvided,
          fixedFeeMinor: dto.fixedFeeMinor != null ? BigInt(dto.fixedFeeMinor) : null,
          destinationUrl: dto.destinationUrl,
          conversionSourceType: dto.conversionSourceType,
          integrationId: dto.integrationId,
          fulfillmentMode: dto.fulfillmentMode,
          locationCountry: dto.locationCountry,
          locationCity: dto.locationCity,
          platforms: dto.platforms,
          currency: dto.currency,
          customerDiscountConfig: dto.discountConfig,
          commissionRuleId: rule.id,
          attributionPolicy: dto.attributionPolicy,
          attributionPolicyVersion: '1',
          holdPeriodDays: dto.holdPeriodDays,
          conversionApprovalMode: dto.conversionApprovalMode,
          deliverableConfig: dto.deliverables,
          contentRightsConfig: dto.contentRights ?? undefined,
          promotionRules: dto.promotionRules,
          cancellationRefundConfig: dto.cancellationRefundPolicy ? { policy: dto.cancellationRefundPolicy } : undefined,
          disclosureRequirements: dto.disclosureRequirements ?? undefined,
          eligibilityRules: { create: dto.eligibility.map((e) => ({ ruleType: e.ruleType, operator: e.operator, value: e.value })) },
        },
      });
      await this.audit.record({ actorUserId: p.userId, businessId, action: 'campaign.created', objectType: 'campaign', objectId: id, after: campaign }, tx);
      return campaign;
    });
  }

  async update(p: Principal, id: string, dto: UpdateCampaignInput) {
    const before = await this.loadForBusiness(p, id, 'campaign.manage');
    if (before.status === 'ended' || before.status === 'archived') throw new ApiError('INVALID_STATE_TRANSITION', 'Ended or archived campaigns cannot be edited');
    const merged = this.mergeForValidation(before, dto);
    await this.validate(before.business, merged);
    if (dto.participantCap != null) {
      const taken = await this.activeParticipants(id);
      if (dto.participantCap < taken) throw ruleViolation(`The cap cannot be lower than the ${taken} creators already accepted`);
    }
    const commercialChanged = COMMERCIAL_FIELDS.some((f) => f in dto);
    const { version, commission, discountConfig, deliverables, contentRights, promotionRules, cancellationRefundPolicy, disclosureRequirements, attributionPolicy, eligibility, fixedFeeMinor, ...plain } = dto;
    return this.prisma.$transaction(async (tx) => {
      const data: Prisma.CampaignUpdateManyMutationInput & { commissionRuleId?: string } = { ...plain, version: { increment: 1 } };
      if (plain.participantCap !== undefined) data.creatorCapacity = plain.participantCap;
      if (fixedFeeMinor !== undefined) data.fixedFeeMinor = BigInt(fixedFeeMinor);
      if (discountConfig) data.customerDiscountConfig = discountConfig;
      if (deliverables) data.deliverableConfig = deliverables;
      if (contentRights) data.contentRightsConfig = contentRights;
      if (promotionRules) data.promotionRules = promotionRules;
      if (cancellationRefundPolicy !== undefined) data.cancellationRefundConfig = { policy: cancellationRefundPolicy };
      if (disclosureRequirements) data.disclosureRequirements = disclosureRequirements;
      if (commercialChanged) data.configVersion = { increment: 1 };
      if (attributionPolicy) {
        data.attributionPolicy = attributionPolicy;
        data.attributionPolicyVersion = String(Number(before.attributionPolicyVersion) + 1);
      }
      if (commission) {
        // New immutable rule version; existing partnerships keep their frozen snapshot (spec §30).
        const now = new Date();
        const nextVersion = (before.commissionRule?.version ?? 0) + 1;
        if (before.commissionRuleId) await tx.commissionRule.update({ where: { id: before.commissionRuleId }, data: { activeTo: now } });
        const rule = await tx.commissionRule.create({ data: { ...ruleCreateData(before.businessId, `campaign:${id}`, nextVersion, commission, before.currency), activeFrom: now } });
        data.commissionRuleId = rule.id;
      }
      const r = await tx.campaign.updateMany({ where: { id, version }, data: data as Prisma.CampaignUpdateManyMutationInput });
      if (r.count === 0) throw new ApiError('VERSION_CONFLICT', 'This campaign was changed by someone else. Reload and try again.');
      if (eligibility) {
        await tx.campaignEligibilityRule.deleteMany({ where: { campaignId: id } });
        await tx.campaignEligibilityRule.createMany({ data: eligibility.map((e) => ({ campaignId: id, ruleType: e.ruleType, operator: e.operator, value: e.value })) });
      }
      const after = await tx.campaign.findUniqueOrThrow({ where: { id } });
      await this.audit.record({ actorUserId: p.userId, businessId: before.businessId, action: commercialChanged ? 'campaign.terms_changed' : 'campaign.updated', objectType: 'campaign', objectId: id, before: stripRelations(before), after }, tx);
      return after;
    });
  }

  // ─────────────── Lifecycle ───────────────

  async publish(p: Principal, id: string) {
    const c = await this.loadForBusiness(p, id, 'campaign.manage');
    assertTransition(CampaignMachine, c.status as CampaignStatus, 'pending_review');
    await this.publishGates(c);
    const autoApprove = c.business.verificationStatus === 'verified' && (await this.settings.flag('campaigns.auto_publish_verified'));
    return this.prisma.$transaction(async (tx) => {
      await this.transition(tx, c, 'pending_review', p.userId, 'campaign.submitted_for_review');
      if (autoApprove) return this.approveInTx(tx, { ...c, status: 'pending_review' }, null);
      return tx.campaign.findUniqueOrThrow({ where: { id } });
    });
  }

  async adminApprove(p: Principal, id: string) {
    this.access.platform(p, 'admin.campaigns.review');
    const c = await this.load(id);
    if (c.status !== 'pending_review') throw new ApiError('INVALID_STATE_TRANSITION', 'Only campaigns waiting for review can be approved');
    await this.publishGates(c);
    return this.prisma.$transaction((tx) => this.approveInTx(tx, c, p.userId));
  }

  async adminReject(p: Principal, id: string, reason: string) {
    this.access.platform(p, 'admin.campaigns.review');
    const c = await this.load(id);
    return this.prisma.$transaction(async (tx) => {
      await this.transition(tx, c, 'draft', p.userId, 'campaign.review_rejected', reason);
      return tx.campaign.findUniqueOrThrow({ where: { id } });
    });
  }

  async pause(p: Principal, id: string) {
    const c = await this.loadForBusiness(p, id, 'campaign.manage');
    return this.prisma.$transaction(async (tx) => {
      await this.transition(tx, c, 'paused', p.userId, 'campaign.paused');
      return tx.campaign.findUniqueOrThrow({ where: { id } });
    });
  }

  async resume(p: Principal, id: string) {
    const c = await this.loadForBusiness(p, id, 'campaign.manage');
    if (c.status !== 'paused') throw new ApiError('INVALID_STATE_TRANSITION', 'Only paused campaigns can be resumed');
    if (c.endAt && c.endAt <= new Date()) throw ruleViolation('This campaign has already reached its end date');
    const target: CampaignStatus = !c.startAt || c.startAt <= new Date() ? 'active' : 'published';
    return this.prisma.$transaction(async (tx) => {
      await this.transition(tx, c, target, p.userId, 'campaign.resumed');
      return tx.campaign.findUniqueOrThrow({ where: { id } });
    });
  }

  async end(p: Principal, id: string) {
    const c = await this.loadForBusiness(p, id, 'campaign.manage');
    return this.prisma.$transaction((tx) => this.endInTx(tx, c, p.userId, 'campaign.ended'));
  }

  async archive(p: Principal, id: string) {
    const c = await this.loadForBusiness(p, id, 'campaign.manage');
    return this.prisma.$transaction(async (tx) => {
      await this.transition(tx, c, 'archived', p.userId, 'campaign.archived');
      return tx.campaign.findUniqueOrThrow({ where: { id } });
    });
  }

  /** Scheduler (worker cron): start published campaigns whose start time passed; end campaigns past their end time. */
  async runScheduledTransitions(now = new Date()): Promise<{ started: number; ended: number }> {
    const toStart = await this.prisma.campaign.findMany({ where: { status: 'published', OR: [{ startAt: null }, { startAt: { lte: now } }], AND: [{ OR: [{ endAt: null }, { endAt: { gt: now } }] }] } });
    for (const c of toStart) {
      await this.prisma.$transaction((tx) => this.transition(tx, c, 'active', null, 'campaign.started'));
    }
    const toEnd = await this.prisma.campaign.findMany({ where: { status: { in: ['published', 'active', 'paused'] }, endAt: { lte: now } } });
    for (const c of toEnd) {
      await this.prisma.$transaction((tx) => this.endInTx(tx, c, null, 'campaign.ended_by_schedule'));
    }
    return { started: toStart.length, ended: toEnd.length };
  }

  private async approveInTx(tx: TransactionClient, c: Campaign, adminId: string | null) {
    await this.transition(tx, c, 'published', adminId, 'campaign.published');
    const now = new Date();
    if (!c.startAt || c.startAt <= now) await this.transition(tx, { ...c, status: 'published' }, 'active', adminId, 'campaign.started');
    await tx.campaign.update({ where: { id: c.id }, data: { publishedAt: now } });
    return tx.campaign.findUniqueOrThrow({ where: { id: c.id } });
  }

  private async endInTx(tx: TransactionClient, c: Campaign, actor: string | null, action: string) {
    await this.transition(tx, c, 'ended', actor, action);
    const now = new Date();
    // Ending a campaign completes its partnerships and expires promotion assets; history is preserved.
    await tx.partnership.updateMany({ where: { campaignId: c.id, status: { in: ['active', 'paused'] } }, data: { status: 'completed', endedAt: now } });
    await tx.partnership.updateMany({ where: { campaignId: c.id, status: 'pending' }, data: { status: 'cancelled', endedAt: now } });
    await tx.promotionCode.updateMany({ where: { campaignId: c.id, status: { in: ['pending', 'active', 'paused'] } }, data: { status: 'expired' } });
    await tx.referralLink.updateMany({ where: { partnership: { campaignId: c.id }, status: { in: ['pending', 'active', 'paused'] } }, data: { status: 'expired' } });
    await tx.qrAsset.updateMany({ where: { partnership: { campaignId: c.id }, status: 'active' }, data: { status: 'expired' } });
    await tx.campaignApplication.updateMany({ where: { campaignId: c.id, status: { in: ['pending', 'waitlisted'] } }, data: { status: 'expired' } });
    await tx.campaignInvitation.updateMany({ where: { campaignId: c.id, status: 'pending' }, data: { status: 'expired' } });
    return tx.campaign.findUniqueOrThrow({ where: { id: c.id } });
  }

  private async transition(tx: TransactionClient, c: Pick<Campaign, 'id' | 'status' | 'businessId'>, to: CampaignStatus, actor: string | null, action: string, reason?: string) {
    assertTransition(CampaignMachine, c.status as CampaignStatus, to);
    const r = await tx.campaign.updateMany({ where: { id: c.id, status: c.status }, data: { status: to, version: { increment: 1 } } });
    if (r.count === 0) throw new ApiError('VERSION_CONFLICT', 'The campaign status changed concurrently. Reload and try again.');
    await this.audit.record({ actorUserId: actor, actorType: actor ? 'user' : 'system', businessId: c.businessId, action, objectType: 'campaign', objectId: c.id, before: { status: c.status }, after: { status: to }, reason }, tx);
  }

  private async publishGates(c: CampaignWithRelations): Promise<void> {
    const problems: string[] = [];
    if (!c.catalogItem.active) problems.push('The product/service is inactive');
    if (!c.commissionRule) problems.push('Commission terms are missing');
    if (c.fulfillmentMode !== 'offline' && !c.destinationUrl) problems.push('Add the link where customers buy or book');
    if (c.endAt && c.endAt <= new Date()) problems.push('The end date is in the past');
    if (c.applicationDeadlineAt && c.applicationDeadlineAt <= new Date()) problems.push('The application deadline is in the past');
    if (!c.description || c.description.length < 20) problems.push('Describe the campaign (at least 20 characters)');
    if (c.business.verificationStatus === 'suspended') problems.push('Your business is suspended');
    if (problems.length) throw ruleViolation('This campaign is not ready to publish', { problems });
  }

  private async validate(business: { id: string; allowedDestinationHosts: string[] }, dto: Partial<CreateCampaignInput>): Promise<void> {
    if (dto.currency) assertSupportedCurrency(dto.currency);
    if (dto.compensationType) assertSupportedCompensation(dto.compensationType, dto.fixedFeeMinor);
    if (dto.commission && dto.currency) validateCommissionConfig(dto.commission, dto.currency);
    if (dto.destinationUrl) assertAllowedDestination(dto.destinationUrl, business.allowedDestinationHosts);
    if (dto.startAt && dto.endAt && dto.endAt <= dto.startAt) throw ruleViolation('The end date must be after the start date', { field: 'endAt' });
    if (dto.applicationDeadlineAt && dto.endAt && dto.applicationDeadlineAt > dto.endAt) throw ruleViolation('The application deadline must be before the end date', { field: 'applicationDeadlineAt' });
    if (dto.integrationId) {
      const integ = await this.prisma.integration.findFirst({ where: { id: dto.integrationId, businessId: business.id } });
      if (!integ) throw ruleViolation('Integration not found', { field: 'integrationId' });
    }
    if (dto.discountConfig?.type === 'percentage' && dto.discountConfig.rate === '0') throw ruleViolation('Use discount type "none" instead of 0%');
  }

  private mergeForValidation(c: Campaign, dto: UpdateCampaignInput): Partial<CreateCampaignInput> {
    return {
      currency: c.currency,
      compensationType: dto.compensationType ?? c.compensationType,
      fixedFeeMinor: dto.fixedFeeMinor ?? (c.fixedFeeMinor != null ? Number(c.fixedFeeMinor) : undefined),
      commission: dto.commission,
      destinationUrl: dto.destinationUrl,
      startAt: dto.startAt ?? c.startAt ?? undefined,
      endAt: dto.endAt ?? c.endAt ?? undefined,
      applicationDeadlineAt: dto.applicationDeadlineAt ?? c.applicationDeadlineAt ?? undefined,
      integrationId: dto.integrationId,
      discountConfig: dto.discountConfig,
    };
  }

  // ─────────────── Queries ───────────────

  async load(id: string): Promise<CampaignWithRelations> {
    const c = await this.prisma.campaign.findUnique({ where: { id }, include: { commissionRule: true, business: true, catalogItem: true, eligibilityRules: true } });
    if (!c) throw notFound('Campaign');
    return c;
  }

  async loadForBusiness(p: Principal, id: string, permission: 'campaign.read' | 'campaign.manage' | 'application.review'): Promise<CampaignWithRelations> {
    const c = await this.load(id);
    this.access.businessAccess(p, c.businessId, permission);
    return c;
  }

  async activeParticipants(campaignId: string, tx: TransactionClient | PrismaClient = this.prisma): Promise<number> {
    return tx.partnership.count({ where: { campaignId, status: { in: ['pending', 'active', 'paused', 'disputed'] } } });
  }

  async listForBusiness(p: Principal, businessId: string, q: CampaignListQueryDto) {
    this.access.businessAccess(p, businessId, 'campaign.read');
    const where: Prisma.CampaignWhereInput = { businessId, ...(q.status ? { status: q.status } : {}) };
    const [items, total] = await Promise.all([
      this.prisma.campaign.findMany({
        where,
        include: { catalogItem: { select: { name: true } }, _count: { select: { partnerships: true, applications: { where: { status: 'pending' } } } } },
        orderBy: { createdAt: 'desc' },
        take: q.limit,
        skip: q.offset,
      }),
      this.prisma.campaign.count({ where }),
    ]);
    return page(items, total, q);
  }

  /** Campaign detail: full configuration for business members; public explanation for everyone else once published. */
  async detail(p: Principal | undefined, id: string) {
    const c = await this.load(id);
    const isMember = !!p && this.access.isBusinessMember(p, c.businessId);
    const visible = ['published', 'active', 'paused'].includes(c.status);
    if (!isMember && !visible) throw notFound('Campaign');
    const card = await this.card(c);
    const detail = {
      ...card,
      description: c.description,
      timezone: c.timezone,
      catalogItem: { id: c.catalogItem.id, name: c.catalogItem.name, type: c.catalogItem.type, description: c.catalogItem.description, priceMinor: c.catalogItem.priceMinor, currency: c.catalogItem.currency },
      commissionTerms: this.commissionView(c),
      attribution: { ...(c.attributionPolicy as object), policyVersion: c.attributionPolicyVersion, note: 'Sales are credited according to this policy using the business’s verified records. Tracking cannot capture every purchase (e.g. cross-device or privacy settings).' },
      holdPeriodDays: c.holdPeriodDays,
      deliverables: c.deliverableConfig,
      contentRights: c.contentRightsConfig,
      promotionRules: c.promotionRules,
      cancellationRefund: c.cancellationRefundConfig,
      disclosureRequirements: c.disclosureRequirements,
      eligibility: c.eligibilityRules.filter((r) => r.enabled).map((r) => ({ ruleType: r.ruleType, operator: r.operator, value: r.value })),
      conversionSourceType: c.conversionSourceType,
      legalDocumentVersion: c.legalDocumentVersion,
      configVersion: c.configVersion,
    };
    if (!isMember) return detail;
    return { ...detail, status: c.status, version: c.version, destinationUrl: c.destinationUrl, integrationId: c.integrationId, conversionApprovalMode: c.conversionApprovalMode, commissionRuleId: c.commissionRuleId };
  }

  commissionView(c: CampaignWithRelations) {
    const r = c.commissionRule;
    if (!r) return null;
    return {
      type: r.type,
      rate: r.rate?.toString() ?? null,
      fixedMinor: r.fixedMinor,
      currency: r.currency,
      baseType: r.baseType,
      includeTax: r.includeTax,
      includeShipping: r.includeShipping,
      excludedItems: r.excludedItems,
      minMinor: r.minMinor,
      maxMinor: r.maxMinor,
      roundingMode: r.roundingMode,
      refundBehavior: r.refundBehavior,
      version: r.version,
    };
  }

  private async card(c: CampaignWithRelations) {
    const taken = await this.activeParticipants(c.id);
    const cap = c.participantCap;
    const now = new Date();
    const applicationsOpen = OPEN_STATUSES.includes(c.status as CampaignStatus) && (!c.applicationDeadlineAt || c.applicationDeadlineAt > now);
    return {
      id: c.id,
      name: c.name,
      slug: c.slug,
      category: c.category,
      imageFileId: c.imageFileId,
      business: { id: c.business.id, displayName: c.business.displayName, verificationStatus: c.business.verificationStatus, city: c.business.city, country: c.business.country },
      productName: c.catalogItem.name,
      priceMinor: c.catalogItem.priceMinor,
      priceCurrency: c.catalogItem.currency,
      currency: c.currency,
      customerDiscount: c.customerDiscountConfig,
      creatorCommission: c.commissionRule ? { type: c.commissionRule.type, rate: c.commissionRule.rate?.toString() ?? null, fixedMinor: c.commissionRule.fixedMinor, baseType: c.commissionRule.baseType } : null,
      compensationType: c.compensationType,
      productServiceProvided: c.productServiceProvided,
      startAt: c.startAt,
      endAt: c.endAt,
      durationDays: c.startAt && c.endAt ? Math.ceil((c.endAt.getTime() - c.startAt.getTime()) / 86400000) : null,
      location: { country: c.locationCountry, city: c.locationCity },
      fulfillmentMode: c.fulfillmentMode,
      platforms: c.platforms,
      participantCap: cap,
      spotsLeft: cap != null ? Math.max(0, cap - taken) : null,
      applicationDeadlineAt: c.applicationDeadlineAt,
      waitlistEnabled: c.waitlistEnabled,
      applicationsOpen,
      status: OPEN_STATUSES.includes(c.status as CampaignStatus) ? 'open' : c.status === 'paused' ? 'paused' : 'closed',
    };
  }

  async marketplace(q: MarketplaceQueryDto) {
    const where: Prisma.CampaignWhereInput = { status: { in: ['published', 'active'] }, business: { verificationStatus: { not: 'suspended' } } };
    const and: Prisma.CampaignWhereInput[] = [];
    if (q.q) and.push({ OR: [{ name: { contains: q.q, mode: 'insensitive' } }, { catalogItem: { name: { contains: q.q, mode: 'insensitive' } } }, { business: { displayName: { contains: q.q, mode: 'insensitive' } } }] });
    if (q.category) and.push({ category: q.category });
    if (q.country) and.push({ locationCountry: q.country });
    if (q.city) and.push({ locationCity: { equals: q.city, mode: 'insensitive' } });
    if (q.platform) and.push({ platforms: { has: q.platform } });
    if (q.compensationType) and.push({ compensationType: q.compensationType });
    if (q.fulfillmentMode) and.push({ fulfillmentMode: q.fulfillmentMode });
    if (q.productServiceProvided) and.push({ productServiceProvided: q.productServiceProvided === 'true' });
    if (q.hasDiscount === 'true') and.push({ NOT: { customerDiscountConfig: { equals: { type: 'none' } } } });
    if (q.hasDiscount === 'false') and.push({ customerDiscountConfig: { equals: { type: 'none' } } });
    if (q.minCommissionRate) and.push({ commissionRule: { type: 'percentage', rate: { gte: q.minCommissionRate } } });
    if (and.length) where.AND = and;
    const rows = await this.prisma.campaign.findMany({
      where,
      include: { commissionRule: true, business: true, catalogItem: true, eligibilityRules: true },
      orderBy: q.sort === 'ending_soon' ? [{ endAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }] : { publishedAt: { sort: 'desc', nulls: 'last' } },
    });
    const filtered = q.maxDurationDays ? rows.filter((c) => c.startAt && c.endAt && (c.endAt.getTime() - c.startAt.getTime()) / 86400000 <= q.maxDurationDays!) : rows;
    const pageRows = filtered.slice(q.offset, q.offset + q.limit);
    const cards = await Promise.all(pageRows.map((c) => this.card(c)));
    return page(cards, filtered.length, q);
  }

  private async uniqueSlug(businessId: string, name: string): Promise<string> {
    const base = slugify(name);
    for (let i = 0; i < 100; i++) {
      const s = i === 0 ? base : `${base}-${i + 1}`;
      if (!(await this.prisma.campaign.findUnique({ where: { businessId_slug: { businessId, slug: s } }, select: { id: true } }))) return s;
    }
    return `${base}-${Date.now().toString(36)}`;
  }
}

function stripRelations(c: CampaignWithRelations) {
  const { business: _b, catalogItem: _c, eligibilityRules: _e, commissionRule: _r, ...rest } = c;
  return rest;
}

export const trackingBaseUrl = (env: Env): string => env.TRACKING_PUBLIC_URL.replace(/\/$/, '');
