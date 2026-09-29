import { Inject, Injectable } from '@nestjs/common';
import type { PrismaClient } from '@codek/database';
import { assertTransition, DeliverableMachine, type DeliverableStatus } from '@codek/domain';
import { PRISMA } from '../../prisma/prisma.service';
import { AccessService } from '../../access/access.service';
import { AuditService } from '../../audit/audit.service';
import { OutboxService } from '../../outbox/outbox.service';
import { ApiError, notFound, ruleViolation } from '../../common/errors';
import type { Principal } from '../../auth/principal';
import { FilesService } from '../files/files.service';

/** Deliverables & content submissions (spec §4.7, §12.3): Not Started → Submitted → (Changes Requested → Resubmitted) → Approved. */
@Injectable()
export class DeliverablesService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly files: FilesService,
  ) {}

  async list(p: Principal, partnershipId: string) {
    const ps = await this.prisma.partnership.findUnique({ where: { id: partnershipId } });
    if (!ps) throw notFound('Partnership');
    this.access.partnershipParty(p, ps);
    const [deliverables, rights] = await Promise.all([
      this.prisma.deliverable.findMany({ where: { partnershipId }, include: { submissions: { orderBy: { submittedAt: 'asc' } } }, orderBy: { createdAt: 'asc' } }),
      this.prisma.contentRight.findMany({ where: { partnershipId }, orderBy: { createdAt: 'asc' } }),
    ]);
    return { deliverables, contentRights: rights };
  }

  async add(p: Principal, partnershipId: string, dto: { type: string; description?: string; dueAt?: Date; required: boolean }) {
    const ps = await this.prisma.partnership.findUnique({ where: { id: partnershipId } });
    if (!ps) throw notFound('Partnership');
    this.access.businessAccess(p, ps.businessId, 'partnership.manage');
    if (!['active', 'paused', 'pending'].includes(ps.status)) throw ruleViolation('This partnership has ended');
    const d = await this.prisma.deliverable.create({ data: { partnershipId, type: dto.type, description: dto.description, dueAt: dto.dueAt, required: dto.required } });
    await this.audit.record({ actorUserId: p.userId, businessId: ps.businessId, action: 'deliverable.added', objectType: 'deliverable', objectId: d.id, after: d });
    return d;
  }

  async submit(p: Principal, deliverableId: string, dto: { url?: string; fileId?: string; caption?: string }) {
    const creatorId = this.access.creatorId(p);
    const d = await this.prisma.deliverable.findUnique({ where: { id: deliverableId }, include: { partnership: true } });
    if (!d || d.partnership.creatorId !== creatorId) throw notFound('Deliverable');
    if (!['active', 'paused'].includes(d.partnership.status)) throw ruleViolation('This partnership is not active');
    if (!dto.url && !dto.fileId) throw new ApiError('VALIDATION_FAILED', 'Add a link to the published content or upload a file');
    const next: DeliverableStatus = d.status === 'changes_requested' ? 'resubmitted' : 'submitted';
    assertTransition(DeliverableMachine, d.status as DeliverableStatus, next);
    return this.prisma.$transaction(async (tx) => {
      if (dto.fileId) await this.files.claim(tx, p, dto.fileId, { ownerType: 'partnership', ownerId: d.partnershipId }, 'content_submission');
      const r = await tx.deliverable.updateMany({ where: { id: deliverableId, status: d.status }, data: { status: next, version: { increment: 1 } } });
      if (r.count === 0) throw new ApiError('VERSION_CONFLICT', 'The deliverable changed, reload and retry');
      const s = await tx.contentSubmission.create({ data: { deliverableId, creatorId, url: dto.url, fileId: dto.fileId, caption: dto.caption, status: next === 'resubmitted' ? 'resubmitted' : 'submitted' } });
      await tx.partnershipEvent.create({ data: { partnershipId: d.partnershipId, eventType: 'content_submitted', actorUserId: p.userId, data: { deliverableId, submissionId: s.id } } });
      await this.audit.record({ actorUserId: p.userId, businessId: d.partnership.businessId, action: 'deliverable.submitted', objectType: 'content_submission', objectId: s.id }, tx);
      await this.outbox.enqueue(tx, { eventType: 'DeliverableSubmitted', aggregateType: 'deliverable', aggregateId: deliverableId, businessId: d.partnership.businessId, payload: { deliverableId, submissionId: s.id, partnershipId: d.partnershipId } });
      return s;
    });
  }

  async review(p: Principal, submissionId: string, decision: 'approved' | 'changes_requested', note?: string) {
    const s = await this.prisma.contentSubmission.findUnique({ where: { id: submissionId }, include: { deliverable: { include: { partnership: true } } } });
    if (!s) throw notFound('Submission');
    const ps = s.deliverable.partnership;
    this.access.businessAccess(p, ps.businessId, 'partnership.manage');
    if (!['submitted', 'resubmitted'].includes(s.status)) throw new ApiError('INVALID_STATE_TRANSITION', 'This submission was already reviewed');
    if (decision === 'changes_requested' && !note) throw new ApiError('VALIDATION_FAILED', 'Explain what should change');
    assertTransition(DeliverableMachine, s.deliverable.status as DeliverableStatus, decision);
    return this.prisma.$transaction(async (tx) => {
      await tx.contentSubmission.update({ where: { id: submissionId }, data: { status: decision, reviewedAt: new Date(), reviewedBy: p.userId, reviewNote: note } });
      await tx.deliverable.update({ where: { id: s.deliverableId }, data: { status: decision, version: { increment: 1 } } });
      await tx.partnershipEvent.create({ data: { partnershipId: ps.id, eventType: decision === 'approved' ? 'content_approved' : 'content_changes_requested', actorUserId: p.userId, data: { submissionId } } });
      await this.audit.record({ actorUserId: p.userId, businessId: ps.businessId, action: `deliverable.${decision}`, objectType: 'content_submission', objectId: submissionId, reason: note }, tx);
      await this.outbox.enqueue(tx, { eventType: 'DeliverableReviewed', aggregateType: 'deliverable', aggregateId: s.deliverableId, businessId: ps.businessId, payload: { deliverableId: s.deliverableId, submissionId, partnershipId: ps.id, creatorId: ps.creatorId, decision, note: note ?? null } });
      return tx.contentSubmission.findUniqueOrThrow({ where: { id: submissionId } });
    });
  }
}
