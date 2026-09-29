import { createHash } from 'node:crypto';
import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { OutboxEvent, Prisma, PrismaClient } from '@codek/database';
import { assertTransition, FraudCaseMachine, pseudonymize, type FraudCaseStatus } from '@codek/domain';
import type { Env } from '@codek/config';
import { ENV } from '../../config/config.module';
import { PRISMA } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { OutboxService } from '../../outbox/outbox.service';
import { OutboxHandlers } from '../../outbox/outbox.dispatcher';
import { SettingsService } from '../../settings/settings.service';
import { ApiError, notFound } from '../../common/errors';
import { page, type Pagination } from '../../common/pagination';
import type { Principal } from '../../auth/principal';
import { CommissionService } from '../finance/commission.service';

type Severity = 'low' | 'medium' | 'high' | 'critical';

/**
 * Fraud workflow (spec §13.1-13.2): Signal → Flag → Case → Review → Decision → Action. Automated signals only flag;
 * consequential actions (holds, reversals, suspension) are taken by a reviewer with an auditable reason.
 * High/critical open flags pause payout requests for the subject (risk hold), which is reversible.
 */
@Injectable()
export class FraudService implements OnModuleInit {
  private readonly logger = new Logger('FraudService');

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(ENV) private readonly env: Env,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly handlers: OutboxHandlers,
    private readonly settings: SettingsService,
    private readonly commissions: CommissionService,
  ) {}

  onModuleInit(): void {
    this.handlers.on('ConversionRecorded', (e) => this.onConversion(e));
    this.handlers.on('AttributionResolved', (e) => this.onAttribution(e));
    this.handlers.on('CommissionReversed', (e) => this.onReversal(e));
  }

  async flag(input: { businessId?: string | null; subjectType: string; subjectId: string; signalType: string; severity: Severity; evidence: Record<string, unknown>; dedupeKey: string; score?: string }): Promise<boolean> {
    const r = await this.prisma.fraudFlag.createMany({
      data: [{ businessId: input.businessId ?? null, subjectType: input.subjectType, subjectId: input.subjectId, signalType: input.signalType, severity: input.severity, evidenceJson: input.evidence as Prisma.InputJsonValue, dedupeKey: input.dedupeKey, score: input.score }],
      skipDuplicates: true,
    });
    if (r.count) {
      await this.prisma.$transaction((tx) => this.outbox.enqueue(tx, { eventType: 'FraudFlagged', aggregateType: input.subjectType, aggregateId: input.subjectId, businessId: input.businessId ?? null, payload: { signalType: input.signalType, severity: input.severity } }));
      this.logger.warn({ signal: input.signalType, severity: input.severity, subjectType: input.subjectType }, 'fraud signal flagged');
    }
    return r.count > 0;
  }

  // ─────────────── Signal detectors (idempotent, outbox-driven) ───────────────

  private async onConversion(e: OutboxEvent): Promise<void> {
    const conv = await this.prisma.conversion.findUnique({ where: { id: e.aggregateId } });
    if (!conv) return;
    if (conv.creatorId && conv.customerRefHash) {
      // Self-referral: the customer reference equals the creator's own identity (raw or SHA-256 email reference).
      const creator = await this.prisma.creator.findUnique({ where: { id: conv.creatorId }, include: { user: { select: { email: true, id: true } } } });
      if (creator) {
        const email = creator.user.email.toLowerCase();
        const candidates = [email, createHash('sha256').update(email).digest('hex'), creator.user.id].map((v) => pseudonymize(v, this.env.HASH_PEPPER));
        if (candidates.includes(conv.customerRefHash)) {
          await this.flag({ businessId: conv.businessId, subjectType: 'creator', subjectId: conv.creatorId, signalType: 'self_referral', severity: 'high', evidence: { conversionId: conv.id }, dedupeKey: `self_referral:${conv.id}` });
        }
      }
      const repeats = await this.prisma.conversion.count({ where: { partnershipId: conv.partnershipId, customerRefHash: conv.customerRefHash, occurredAt: { gte: new Date(conv.occurredAt.getTime() - 86400000) } } });
      if (repeats >= 4) await this.flag({ businessId: conv.businessId, subjectType: 'partnership', subjectId: conv.partnershipId!, signalType: 'repeated_orders', severity: 'medium', evidence: { customerOrders24h: repeats, conversionId: conv.id }, dedupeKey: `repeated_orders:${conv.partnershipId}:${conv.customerRefHash}:${conv.occurredAt.toISOString().slice(0, 10)}` });
    }
    if (conv.partnershipId) {
      const { perHour } = await this.settings.get<{ perHour: number }>('fraud.conversion_spike_threshold', { perHour: 50 });
      const lastHour = await this.prisma.conversion.count({ where: { partnershipId: conv.partnershipId, createdAt: { gte: new Date(Date.now() - 3600_000) } } });
      if (lastHour >= perHour) await this.flag({ businessId: conv.businessId, subjectType: 'partnership', subjectId: conv.partnershipId, signalType: 'conversion_spike', severity: 'medium', evidence: { conversionsLastHour: lastHour, threshold: perHour }, dedupeKey: `conversion_spike:${conv.partnershipId}:${new Date().toISOString().slice(0, 13)}` });
      // Code leakage: many code redemptions with no referral clicks at all for the partnership in 24h.
      const codeUses = await this.prisma.promotionCodeRedemption.count({ where: { promotionCode: { partnershipId: conv.partnershipId }, redeemedAt: { gte: new Date(Date.now() - 86400000) } } });
      if (codeUses >= 20) {
        const clicks = await this.prisma.trackingClick.count({ where: { partnershipId: conv.partnershipId, occurredAt: { gte: new Date(Date.now() - 86400000) } } });
        if (clicks === 0) await this.flag({ businessId: conv.businessId, subjectType: 'partnership', subjectId: conv.partnershipId, signalType: 'code_leakage', severity: 'low', evidence: { codeUses24h: codeUses, clicks24h: clicks }, dedupeKey: `code_leakage:${conv.partnershipId}:${new Date().toISOString().slice(0, 10)}` });
      }
    }
    if (conv.sourceSystem === 'redemption_interface') {
      const recent = await this.prisma.auditLog.count({ where: { action: 'conversion.redemption_recorded', tenantBusinessId: conv.businessId, createdAt: { gte: new Date(Date.now() - 3600_000) } } });
      if (recent >= 30) await this.flag({ businessId: conv.businessId, subjectType: 'business', subjectId: conv.businessId, signalType: 'suspicious_staff_redemptions', severity: 'medium', evidence: { redemptionsLastHour: recent }, dedupeKey: `staff_redemptions:${conv.businessId}:${new Date().toISOString().slice(0, 13)}` });
    }
  }

  private async onAttribution(e: OutboxEvent): Promise<void> {
    const p = e.payloadJson as { conflictState?: string; decisionState?: string; conversionId: string; partnershipId?: string | null };
    if (p.conflictState === 'conflict' || p.conflictState === 'unresolved') {
      await this.flag({ businessId: e.businessId, subjectType: 'conversion', subjectId: p.conversionId, signalType: 'attribution_conflict', severity: p.conflictState === 'unresolved' ? 'medium' : 'low', evidence: { decisionState: p.decisionState }, dedupeKey: `attribution_conflict:${p.conversionId}` });
    }
  }

  private async onReversal(e: OutboxEvent): Promise<void> {
    const calc = await this.prisma.commissionCalculation.findUnique({ where: { id: e.aggregateId } });
    if (!calc) return;
    const { ratio, minConversions } = await this.settings.get<{ ratio: string; minConversions: number }>('fraud.refund_spike_ratio', { ratio: '0.5', minConversions: 10 });
    const since = new Date(Date.now() - 30 * 86400000);
    const [total, refunded] = await Promise.all([
      this.prisma.conversion.count({ where: { partnershipId: calc.partnershipId, occurredAt: { gte: since } } }),
      this.prisma.conversion.count({ where: { partnershipId: calc.partnershipId, occurredAt: { gte: since }, status: { in: ['refunded', 'partially_refunded', 'cancelled'] } } }),
    ]);
    if (total >= minConversions && refunded * 1000 >= Math.round(Number(ratio) * 1000) * total) {
      await this.flag({ businessId: calc.businessId, subjectType: 'partnership', subjectId: calc.partnershipId, signalType: 'refund_spike', severity: 'medium', evidence: { conversions30d: total, refunded30d: refunded }, dedupeKey: `refund_spike:${calc.partnershipId}:${new Date().toISOString().slice(0, 10)}` });
    }
  }

  // ─────────────── Review workflow ───────────────

  async flags(q: Pagination & { status?: string; severity?: string }) {
    const where: Prisma.FraudFlagWhereInput = { ...(q.status ? { status: q.status as 'open' } : {}), ...(q.severity ? { severity: q.severity as Severity } : {}) };
    const [items, total] = await Promise.all([this.prisma.fraudFlag.findMany({ where, orderBy: { createdAt: 'desc' }, take: q.limit, skip: q.offset }), this.prisma.fraudFlag.count({ where })]);
    return page(items, total, q);
  }

  async dismissFlag(p: Principal, id: string, reason: string) {
    const f = await this.prisma.fraudFlag.findUnique({ where: { id } });
    if (!f) throw notFound('Fraud flag');
    if (!['open', 'reviewing'].includes(f.status)) throw new ApiError('INVALID_STATE_TRANSITION', 'Flag already resolved');
    await this.prisma.fraudFlag.update({ where: { id }, data: { status: 'dismissed', resolvedAt: new Date() } });
    await this.audit.record({ actorUserId: p.userId, actorType: 'admin', businessId: f.businessId, action: 'fraud.flag_dismissed', objectType: 'fraud_flag', objectId: id, reason });
    return this.prisma.fraudFlag.findUniqueOrThrow({ where: { id } });
  }

  async openCase(p: Principal, dto: { subjectType: string; subjectId: string; riskLevel: Severity; summary: string; flagIds: string[]; businessId?: string }) {
    return this.prisma.$transaction(async (tx) => {
      const c = await tx.fraudCase.create({ data: { subjectType: dto.subjectType, subjectId: dto.subjectId, riskLevel: dto.riskLevel, summary: dto.summary, businessId: dto.businessId ?? null, reviewerUserId: p.userId } });
      if (dto.flagIds.length) await tx.fraudFlag.updateMany({ where: { id: { in: dto.flagIds }, status: { in: ['open', 'reviewing'] } }, data: { status: 'reviewing', fraudCaseId: c.id } });
      await this.audit.record({ actorUserId: p.userId, actorType: 'admin', businessId: dto.businessId ?? null, action: 'fraud.case_opened', objectType: 'fraud_case', objectId: c.id, after: c }, tx);
      return c;
    });
  }

  async getCase(id: string) {
    const c = await this.prisma.fraudCase.findUnique({ where: { id }, include: { flags: true } });
    if (!c) throw notFound('Fraud case');
    const history = await this.prisma.auditLog.findMany({ where: { objectType: 'fraud_case', objectId: id }, orderBy: { seq: 'asc' } });
    return { ...c, history };
  }

  async cases(q: Pagination & { status?: string }) {
    const where: Prisma.FraudCaseWhereInput = q.status ? { status: q.status as FraudCaseStatus } : {};
    const [items, total] = await Promise.all([this.prisma.fraudCase.findMany({ where, include: { _count: { select: { flags: true } } }, orderBy: { createdAt: 'desc' }, take: q.limit, skip: q.offset }), this.prisma.fraudCase.count({ where })]);
    return page(items, total, q);
  }

  /** Move a case through evidence/review/decision/closed. Decisions record a resolution code and optional holds. */
  async transition(p: Principal, id: string, to: FraudCaseStatus, reason: string, decision?: { resolutionCode: 'no_fraud' | 'confirmed_fraud' | 'inconclusive'; holdCommissions?: boolean; releaseHolds?: boolean }) {
    const c = await this.prisma.fraudCase.findUnique({ where: { id } });
    if (!c) throw notFound('Fraud case');
    assertTransition(FraudCaseMachine, c.status as FraudCaseStatus, to);
    if (to === 'decision' && !decision) throw new ApiError('VALIDATION_FAILED', 'A decision requires a resolution code');
    return this.prisma.$transaction(async (tx) => {
      const r = await tx.fraudCase.updateMany({ where: { id, version: c.version }, data: { status: to, version: { increment: 1 }, ...(decision ? { resolutionCode: decision.resolutionCode, decisionReason: reason } : {}), ...(to === 'closed' ? { closedAt: new Date() } : {}) } });
      if (!r.count) throw new ApiError('VERSION_CONFLICT', 'The case changed, reload and retry');
      if (decision?.holdCommissions || decision?.releaseHolds) {
        const where = this.commissionScope(c.subjectType, c.subjectId);
        if (where) {
          const affected = await tx.commissionCalculation.findMany({ where: { ...where, status: { in: ['pending', 'approved', 'funded', 'available'] } }, select: { id: true } });
          for (const a of affected) await this.commissions.setHold(tx, a.id, !!decision.holdCommissions, `fraud_case:${id}`, p.userId);
        }
      }
      if (to === 'closed') await tx.fraudFlag.updateMany({ where: { fraudCaseId: id, status: { in: ['open', 'reviewing'] } }, data: { status: c.resolutionCode === 'no_fraud' ? 'dismissed' : 'resolved', resolvedAt: new Date() } });
      await this.audit.record({ actorUserId: p.userId, actorType: 'admin', businessId: c.businessId, action: `fraud.case_${to}`, objectType: 'fraud_case', objectId: id, before: { status: c.status }, after: { status: to, ...(decision ?? {}) }, reason }, tx);
      return tx.fraudCase.findUniqueOrThrow({ where: { id } });
    });
  }

  private commissionScope(subjectType: string, subjectId: string): Prisma.CommissionCalculationWhereInput | null {
    if (subjectType === 'creator') return { creatorId: subjectId };
    if (subjectType === 'partnership') return { partnershipId: subjectId };
    if (subjectType === 'conversion') return { conversionId: subjectId };
    if (subjectType === 'business') return { businessId: subjectId };
    return null;
  }
}
