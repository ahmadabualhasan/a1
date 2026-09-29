import { Inject, Injectable } from '@nestjs/common';
import type { Prisma, PrismaClient } from '@codek/database';
import { assertTransition, customerTotal, DisputeMachine, type DisputeStatus } from '@codek/domain';
import { PRISMA } from '../../prisma/prisma.service';
import { AccessService } from '../../access/access.service';
import { AuditService } from '../../audit/audit.service';
import { OutboxService } from '../../outbox/outbox.service';
import { ApiError, notFound, ruleViolation } from '../../common/errors';
import type { Principal } from '../../auth/principal';
import { amountsOf, CommissionService } from '../finance/commission.service';
import { FilesService } from '../files/files.service';

/**
 * Disputes (spec §13.3): Open → Evidence → Hold → Review → Decision → Adjustment/Reversal → Closed.
 * Parties open disputes and add evidence; CODEK operations drive the lifecycle. Holds and reversals go through the
 * commission service (ledger entries), never by editing history. Evidence is preserved.
 */
@Injectable()
export class DisputesService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly commissions: CommissionService,
    private readonly files: FilesService,
  ) {}

  async open(p: Principal, dto: { type: string; summary: string; partnershipId?: string; conversionId?: string }) {
    let businessId: string | null = null;
    let creatorId: string | null = null;
    let partnershipId = dto.partnershipId ?? null;
    if (dto.conversionId) {
      const conv = await this.prisma.conversion.findUnique({ where: { id: dto.conversionId } });
      if (!conv || !conv.partnershipId) throw notFound('Conversion');
      if (partnershipId && partnershipId !== conv.partnershipId) throw ruleViolation('Conversion does not belong to this partnership');
      partnershipId = conv.partnershipId;
    }
    if (!partnershipId) throw new ApiError('VALIDATION_FAILED', 'Choose the partnership or sale the dispute is about');
    const ps = await this.prisma.partnership.findUnique({ where: { id: partnershipId } });
    if (!ps) throw notFound('Partnership');
    const role = this.access.partnershipParty(p, ps, 'dispute.open');
    if (role === 'creator' && !p.creatorPermissions.has('dispute.open')) throw new ApiError('FORBIDDEN', 'You cannot open disputes');
    businessId = ps.businessId;
    creatorId = ps.creatorId;
    return this.prisma.$transaction(async (tx) => {
      const d = await tx.dispute.create({ data: { businessId, creatorId, partnershipId, conversionId: dto.conversionId ?? null, type: dto.type, summary: dto.summary, openedByUserId: p.userId } });
      await this.audit.record({ actorUserId: p.userId, businessId, action: 'dispute.opened', objectType: 'dispute', objectId: d.id, after: d }, tx);
      await this.outbox.enqueue(tx, { eventType: 'DisputeOpened', aggregateType: 'dispute', aggregateId: d.id, businessId, payload: { disputeId: d.id, creatorId, partnershipId, conversionId: dto.conversionId ?? null } });
      return d;
    });
  }

  private async loadForParty(p: Principal, id: string) {
    const d = await this.prisma.dispute.findUnique({ where: { id }, include: { evidence: { orderBy: { createdAt: 'asc' } } } });
    if (!d) throw notFound('Dispute');
    const isAdmin = p.platformPermissions.has('admin.disputes.manage');
    const isCreator = !!p.creatorId && d.creatorId === p.creatorId;
    const isBusiness = !!d.businessId && p.businesses.has(d.businessId);
    if (!isAdmin && !isCreator && !isBusiness) throw notFound('Dispute');
    return d;
  }

  async get(p: Principal, id: string) {
    const d = await this.loadForParty(p, id);
    const timeline = await this.prisma.auditLog.findMany({ where: { objectType: 'dispute', objectId: id }, orderBy: { seq: 'asc' }, select: { action: true, reason: true, createdAt: true, afterJson: true } });
    return { ...d, timeline };
  }

  async listMine(p: Principal) {
    const or: Prisma.DisputeWhereInput[] = [];
    if (p.creatorId) or.push({ creatorId: p.creatorId });
    const bizIds = [...p.businesses.keys()];
    if (bizIds.length) or.push({ businessId: { in: bizIds } });
    if (!or.length) return [];
    return this.prisma.dispute.findMany({ where: { OR: or }, orderBy: { createdAt: 'desc' }, take: 200 });
  }

  async addEvidence(p: Principal, id: string, dto: { description?: string; externalUrl?: string; fileId?: string }) {
    const d = await this.loadForParty(p, id);
    if (d.status === 'closed') throw ruleViolation('This dispute is closed');
    if (!dto.description && !dto.externalUrl && !dto.fileId) throw new ApiError('VALIDATION_FAILED', 'Add a description, link or file');
    return this.prisma.$transaction(async (tx) => {
      if (dto.fileId) await this.files.claim(tx, p, dto.fileId, { ownerType: 'dispute', ownerId: id }, 'dispute_evidence');
      const ev = await tx.disputeEvidence.create({ data: { disputeId: id, submittedBy: p.userId, description: dto.description, externalUrl: dto.externalUrl, fileId: dto.fileId } });
      await this.audit.record({ actorUserId: p.userId, businessId: d.businessId, action: 'dispute.evidence_added', objectType: 'dispute', objectId: id, after: { evidenceId: ev.id } }, tx);
      return ev;
    });
  }

  /** Admin lifecycle control. `hold` places commission holds; `adjustment` with reverse=true reverses the commission. */
  async transition(p: Principal, id: string, to: DisputeStatus, reason: string, opts: { decisionCode?: 'uphold_creator' | 'uphold_business' | 'partial'; reverseCommission?: boolean } = {}) {
    this.access.platform(p, 'admin.disputes.manage');
    const d = await this.prisma.dispute.findUnique({ where: { id } });
    if (!d) throw notFound('Dispute');
    assertTransition(DisputeMachine, d.status as DisputeStatus, to);
    if (to === 'decision' && !opts.decisionCode) throw new ApiError('VALIDATION_FAILED', 'A decision code is required');
    return this.prisma.$transaction(async (tx) => {
      const r = await tx.dispute.updateMany({ where: { id, version: d.version }, data: { status: to, version: { increment: 1 }, ...(opts.decisionCode ? { decisionCode: opts.decisionCode, decisionReason: reason, decidedBy: p.userId } : {}), ...(to === 'closed' ? { closedAt: new Date() } : {}) } });
      if (!r.count) throw new ApiError('VERSION_CONFLICT', 'The dispute changed, reload and retry');
      const scope: Prisma.CommissionCalculationWhereInput | null = d.conversionId ? { conversionId: d.conversionId } : d.partnershipId ? { partnershipId: d.partnershipId } : null;
      if (scope && to === 'hold') {
        for (const c of await tx.commissionCalculation.findMany({ where: { ...scope, status: { in: ['pending', 'approved', 'funded', 'available'] } } })) await this.commissions.setHold(tx, c.id, true, `dispute:${id}`, p.userId);
      }
      if (scope && to === 'adjustment' && opts.reverseCommission && d.conversionId) {
        const conv = await tx.conversion.findUniqueOrThrow({ where: { id: d.conversionId } });
        const total = conv.currency && conv.grossMinor != null ? customerTotal(amountsOf(conv)) : 1n;
        await this.commissions.applyRefund(tx, conv, total > 0n ? total : 1n, `dispute_adjustment:${id}`);
      }
      if (scope && to === 'closed') {
        for (const c of await tx.commissionCalculation.findMany({ where: { ...scope, onHold: true, holdReason: `dispute:${id}` } })) await this.commissions.setHold(tx, c.id, false, `dispute_closed:${id}`, p.userId);
      }
      await this.audit.record({ actorUserId: p.userId, actorType: 'admin', businessId: d.businessId, action: `dispute.${to}`, objectType: 'dispute', objectId: id, before: { status: d.status }, after: { status: to, ...opts }, reason }, tx);
      return tx.dispute.findUniqueOrThrow({ where: { id } });
    });
  }

  async adminList(status?: string) {
    return this.prisma.dispute.findMany({ where: status ? { status: status as DisputeStatus } : {}, orderBy: { createdAt: 'desc' }, take: 200 });
  }
}
