import { Inject, Injectable } from '@nestjs/common';
import type { Prisma, PrismaClient } from '@codek/database';
import { canTransition, ConversionMachine, normalizedOrderSchema, type ConversionStatus } from '@codek/domain';
import { randomUUID } from 'node:crypto';
import { PRISMA } from '../../prisma/prisma.service';
import { AccessService } from '../../access/access.service';
import { AuditService } from '../../audit/audit.service';
import { ApiError, notFound, ruleViolation } from '../../common/errors';
import { page, type Pagination } from '../../common/pagination';
import type { Principal } from '../../auth/principal';
import { CommissionService } from '../finance/commission.service';
import { ConversionsService } from './conversions.service';

/** Public conversion fields. Customer references are never returned (spec §14.2). */
const CONVERSION_SELECT = {
  id: true,
  businessId: true,
  campaignId: true,
  partnershipId: true,
  creatorId: true,
  type: true,
  status: true,
  externalRef: true,
  grossMinor: true,
  discountMinor: true,
  taxMinor: true,
  shippingFeeMinor: true,
  netMinor: true,
  commissionableMinor: true,
  refundedMinor: true,
  currency: true,
  verifiedState: true,
  sourceSystem: true,
  reviewReason: true,
  occurredAt: true,
  paidConfirmedAt: true,
  createdAt: true,
  commission: { select: { id: true, status: true, commissionMinor: true, feeMinor: true, reversedMinor: true, clawbackMinor: true, currency: true, holdUntil: true, onHold: true } },
} satisfies Prisma.ConversionSelect;

export interface RedemptionInput {
  businessId: string;
  promotionCode: string;
  externalRef: string;
  occurredAt?: Date;
  currency?: string;
  grossMinor?: number;
  discountMinor?: number;
  taxMinor?: number;
  conversionType?: 'sale' | 'booking' | 'redemption';
  customerRef?: string;
}

@Injectable()
export class ConversionsQueryService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly pipeline: ConversionsService,
    private readonly commissions: CommissionService,
  ) {}

  /** Controlled merchant redemption interface (spec §6.10): a business member records an in-store code redemption. */
  async redeem(p: Principal, input: RedemptionInput) {
    this.access.businessAccess(p, input.businessId, 'conversion.manage');
    const event = normalizedOrderSchema.parse({
      eventType: 'REDEMPTION_CREATED',
      externalEventId: `redemption:${input.externalRef}`,
      externalRef: input.externalRef,
      occurredAt: (input.occurredAt ?? new Date()).toISOString(),
      currency: input.currency,
      grossMinor: input.grossMinor,
      discountMinor: input.discountMinor,
      taxMinor: input.taxMinor,
      discountCodes: [input.promotionCode],
      conversionType: input.conversionType ?? 'redemption',
      customerRef: input.customerRef,
    });
    const r = await this.pipeline.ingest({ businessId: input.businessId, sourceSystem: 'redemption_interface', verifiedState: 'verified', event, actorUserId: p.userId });
    if (r.outcome === 'duplicate') throw new ApiError('CONFLICT', 'This receipt/order reference was already recorded');
    await this.audit.record({ actorUserId: p.userId, businessId: input.businessId, action: 'conversion.redemption_recorded', objectType: 'conversion', objectId: r.conversionId ?? null, after: { externalRef: input.externalRef, decision: r.decisionState } });
    return { ...(await this.get(p, r.conversionId!)), decisionState: r.decisionState };
  }

  /** Lower-confidence manual entry with evidence: self-reported, never auto-approved (spec §6.10). */
  async manualEntry(p: Principal, businessId: string, input: Omit<RedemptionInput, 'businessId'> & { evidenceNote: string }) {
    this.access.businessAccess(p, businessId, 'conversion.manage');
    const event = normalizedOrderSchema.parse({
      eventType: 'ORDER_CREATED',
      externalEventId: `manual:${randomUUID()}`,
      externalRef: input.externalRef,
      occurredAt: (input.occurredAt ?? new Date()).toISOString(),
      currency: input.currency,
      grossMinor: input.grossMinor,
      discountMinor: input.discountMinor,
      taxMinor: input.taxMinor,
      discountCodes: [input.promotionCode],
      conversionType: input.conversionType ?? 'sale',
    });
    const r = await this.pipeline.ingest({ businessId, sourceSystem: 'manual_evidence', verifiedState: 'self_reported', event, actorUserId: p.userId });
    await this.audit.record({ actorUserId: p.userId, businessId, action: 'conversion.manual_entry', objectType: 'conversion', objectId: r.conversionId ?? null, reason: input.evidenceNote });
    return this.get(p, r.conversionId!);
  }

  async listForBusiness(p: Principal, businessId: string, q: Pagination & { status?: string; verifiedState?: string; campaignId?: string; partnershipId?: string }) {
    this.access.businessAccess(p, businessId, 'conversion.read');
    const where: Prisma.ConversionWhereInput = {
      businessId,
      ...(q.status ? { status: q.status as ConversionStatus } : {}),
      ...(q.verifiedState ? { verifiedState: q.verifiedState as 'verified' } : {}),
      ...(q.campaignId ? { campaignId: q.campaignId } : {}),
      ...(q.partnershipId ? { partnershipId: q.partnershipId } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.conversion.findMany({ where, select: CONVERSION_SELECT, orderBy: { occurredAt: 'desc' }, take: q.limit, skip: q.offset }),
      this.prisma.conversion.count({ where }),
    ]);
    return page(items, total, q);
  }

  /** Creator view: own attributed sales only, with order amounts but no customer or merchant-internal data. */
  async creatorSales(p: Principal, q: Pagination) {
    const creatorId = this.access.creatorId(p, 'creator.earnings.read');
    const where: Prisma.ConversionWhereInput = { creatorId };
    const [rows, total] = await Promise.all([
      this.prisma.conversion.findMany({
        where,
        select: { id: true, type: true, status: true, currency: true, commissionableMinor: true, refundedMinor: true, verifiedState: true, occurredAt: true, campaignId: true, partnershipId: true, commission: CONVERSION_SELECT.commission },
        orderBy: { occurredAt: 'desc' },
        take: q.limit,
        skip: q.offset,
      }),
      this.prisma.conversion.count({ where }),
    ]);
    return page(rows, total, q);
  }

  async get(p: Principal, id: string) {
    const c = await this.prisma.conversion.findUnique({ where: { id }, select: { ...CONVERSION_SELECT, events: { select: { id: true, eventType: true, source: true, occurredAt: true, receivedAt: true, processingState: true, processingNote: true }, orderBy: { receivedAt: 'asc' } } } });
    if (!c) throw notFound('Conversion');
    if (p.businesses.has(c.businessId)) {
      this.access.businessAccess(p, c.businessId, 'conversion.read');
      return c;
    }
    if (p.creatorId && c.creatorId === p.creatorId) {
      const { externalRef: _e, events: _ev, reviewReason: _r, sourceSystem: _s, ...creatorView } = c;
      return creatorView;
    }
    if (p.platformPermissions.has('admin.conversions.manage')) return c;
    throw notFound('Conversion');
  }

  async attribution(p: Principal, conversionId: string) {
    const conv = await this.prisma.conversion.findUnique({ where: { id: conversionId } });
    if (!conv) throw notFound('Attribution');
    const isBusiness = p.businesses.get(conv.businessId)?.permissions.has('conversion.read');
    const isAdmin = p.platformPermissions.has('admin.conversions.manage');
    const isCreator = !!p.creatorId && conv.creatorId === p.creatorId;
    if (!isBusiness && !isAdmin && !isCreator) throw notFound('Attribution');
    const decisions = await this.prisma.attributionDecision.findMany({ where: { conversionId }, orderBy: { decidedAt: 'asc' } });
    const touchpoints = isCreator && !isBusiness && !isAdmin ? [] : await this.prisma.attributionTouchpoint.findMany({ where: { conversionId }, orderBy: { occurredAt: 'asc' } });
    const current = decisions.find((d) => d.id === conv.attributionDecisionId) ?? decisions[decisions.length - 1];
    if (isCreator && !isBusiness && !isAdmin) {
      return { current: current ? { decisionState: current.decisionState, method: current.method, policyVersion: current.policyVersion, decidedAt: current.decidedAt } : null };
    }
    return { current, history: decisions, touchpoints };
  }

  /** Business approval for `manual` approval-mode campaigns (verified conversions only). */
  async approve(p: Principal, id: string) {
    const conv = await this.prisma.conversion.findUnique({ where: { id } });
    if (!conv) throw notFound('Conversion');
    this.access.businessAccess(p, conv.businessId, 'conversion.manage');
    if (conv.verifiedState !== 'verified') throw ruleViolation('Self-reported conversions are reviewed by CODEK operations');
    return this.doApprove(p, conv.id, 'business_approval');
  }

  /** Admin approval (e.g. self-reported evidence reviewed by operations). */
  async adminApprove(p: Principal, id: string, reason: string) {
    this.access.platform(p, 'admin.conversions.manage');
    return this.doApprove(p, id, reason);
  }

  private async doApprove(p: Principal, id: string, reason: string) {
    await this.prisma.$transaction(async (tx) => {
      const conv = await tx.conversion.findUniqueOrThrow({ where: { id } });
      if (conv.status !== 'attributed') throw new ApiError('INVALID_STATE_TRANSITION', `Conversion is ${conv.status}; only attributed conversions can be approved`);
      await this.pipeline.approveInTx(tx, conv, p.userId, reason);
      await this.audit.record({ actorUserId: p.userId, businessId: conv.businessId, action: 'conversion.approved', objectType: 'conversion', objectId: id, reason }, tx);
    });
    return this.get(p, id);
  }

  async reject(p: Principal, id: string, reason: string) {
    const conv = await this.prisma.conversion.findUnique({ where: { id } });
    if (!conv) throw notFound('Conversion');
    const isAdmin = p.platformPermissions.has('admin.conversions.manage');
    if (!isAdmin) this.access.businessAccess(p, conv.businessId, 'conversion.manage');
    // Once approved, a business cannot unilaterally reject: it must refund via its source system or open a dispute.
    if (!isAdmin && conv.status !== 'attributed' && conv.status !== 'validated') throw ruleViolation('Approved conversions can only be changed through a refund or a dispute');
    if (!canTransition(ConversionMachine, conv.status as never, 'rejected') && !(isAdmin && conv.status === 'approved')) {
      throw new ApiError('INVALID_STATE_TRANSITION', `Conversion is ${conv.status}`);
    }
    await this.prisma.$transaction(async (tx) => {
      if (conv.status === 'approved') await tx.conversion.update({ where: { id }, data: { status: 'reversed', reviewReason: reason } });
      else await tx.conversion.update({ where: { id }, data: { status: 'rejected', reviewReason: reason } });
      const fresh = await tx.conversion.findUniqueOrThrow({ where: { id } });
      const total = (fresh.grossMinor ?? 0n) - (fresh.discountMinor ?? 0n) + (fresh.taxMinor ?? 0n) + (fresh.shippingFeeMinor ?? 0n);
      await this.commissions.applyRefund(tx, fresh, total > 0n ? total : 1n, `conversion_rejected: ${reason}`);
      await this.audit.record({ actorUserId: p.userId, businessId: conv.businessId, action: 'conversion.rejected', objectType: 'conversion', objectId: id, reason, before: { status: conv.status } }, tx);
    });
    return this.get(p, id);
  }
}
