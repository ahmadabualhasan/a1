import { Inject, Injectable } from '@nestjs/common';
import type { AdminAction, Prisma, PrismaClient, TransactionClient } from '@codek/database';
import type { Permission } from '@codek/domain';
import { PRISMA } from '../../prisma/prisma.service';
import { AccessService } from '../../access/access.service';
import { AuditService } from '../../audit/audit.service';
import { ApiError, notFound } from '../../common/errors';
import { toJsonSafe } from '../../common/json';
import type { Principal } from '../../auth/principal';

export type AdminActionHandler = (tx: TransactionClient, action: AdminAction, executor: Principal) => Promise<unknown>;

interface ActionSpec {
  handler: AdminActionHandler;
  /** Permission needed to request the action. */
  requestPermission: Permission;
  /** Permission the second approver must hold. */
  approvePermission: Permission;
  /** Whether a second, different admin must approve (dual control, spec §2.3). */
  dualApproval: (payload: Record<string, unknown>) => Promise<boolean> | boolean;
}

/**
 * Privileged admin actions with optional dual approval. The request is recorded before execution; high-risk actions
 * wait for a different admin to approve; execution happens in one transaction together with its audit entries.
 */
@Injectable()
export class AdminActionsService {
  private readonly specs = new Map<string, ActionSpec>();

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly access: AccessService,
    private readonly audit: AuditService,
  ) {}

  register(actionType: string, spec: ActionSpec): void {
    this.specs.set(actionType, spec);
  }

  async request(p: Principal, input: { actionType: string; targetType: string; targetId: string; reason: string; payload: Record<string, unknown> }) {
    const spec = this.specs.get(input.actionType);
    if (!spec) throw notFound('Admin action type');
    this.access.platform(p, spec.requestPermission);
    const dual = await spec.dualApproval(input.payload);
    const action = await this.prisma.adminAction.create({
      data: { adminUserId: p.userId, actionType: input.actionType, targetType: input.targetType, targetId: input.targetId, reason: input.reason, payloadJson: toJsonSafe(input.payload) as Prisma.InputJsonValue, approvalState: dual ? 'pending' : 'not_required' },
    });
    await this.audit.record({ actorUserId: p.userId, actorType: 'admin', action: `admin_action.requested`, objectType: input.targetType, objectId: input.targetId, reason: input.reason, after: { actionId: action.id, actionType: input.actionType, dualApproval: dual } });
    if (dual) return { action, executed: false, message: 'Waiting for a second administrator to approve' };
    return this.execute(action, p);
  }

  async approve(p: Principal, id: string) {
    const action = await this.prisma.adminAction.findUnique({ where: { id } });
    if (!action) throw notFound('Admin action');
    const spec = this.specs.get(action.actionType)!;
    this.access.platform(p, spec.approvePermission);
    if (action.approvalState !== 'pending') throw new ApiError('INVALID_STATE_TRANSITION', 'This action is not waiting for approval');
    if (action.adminUserId === p.userId) throw new ApiError('FORBIDDEN', 'A different administrator must approve this action');
    const claimed = await this.prisma.adminAction.updateMany({ where: { id, approvalState: 'pending' }, data: { approvalState: 'approved', approvedBy: p.userId, decidedAt: new Date() } });
    if (!claimed.count) throw new ApiError('VERSION_CONFLICT', 'This action was already decided');
    return this.execute({ ...action, approvalState: 'approved', approvedBy: p.userId }, p);
  }

  async reject(p: Principal, id: string, reason: string) {
    const action = await this.prisma.adminAction.findUnique({ where: { id } });
    if (!action) throw notFound('Admin action');
    this.access.platform(p, this.specs.get(action.actionType)!.approvePermission);
    const r = await this.prisma.adminAction.updateMany({ where: { id, approvalState: 'pending' }, data: { approvalState: 'rejected', approvedBy: p.userId, decidedAt: new Date(), resultJson: { rejectedReason: reason } } });
    if (!r.count) throw new ApiError('INVALID_STATE_TRANSITION', 'This action is not waiting for approval');
    await this.audit.record({ actorUserId: p.userId, actorType: 'admin', action: 'admin_action.rejected', objectType: action.targetType, objectId: action.targetId, reason });
    return this.prisma.adminAction.findUniqueOrThrow({ where: { id } });
  }

  private async execute(action: AdminAction, executor: Principal) {
    const spec = this.specs.get(action.actionType)!;
    const result = await this.prisma.$transaction(async (tx) => {
      const out = await spec.handler(tx, action, executor);
      await tx.adminAction.update({ where: { id: action.id }, data: { executedAt: new Date(), resultJson: toJsonSafe(out ?? null) as Prisma.InputJsonValue } });
      await this.audit.record({ actorUserId: executor.userId, actorType: 'admin', action: `admin_action.executed.${action.actionType}`, objectType: action.targetType, objectId: action.targetId, reason: action.reason, after: { actionId: action.id, requestedBy: action.adminUserId, approvedBy: action.approvedBy } }, tx);
      return out;
    });
    return { action: await this.prisma.adminAction.findUniqueOrThrow({ where: { id: action.id } }), executed: true, result };
  }

  async list(p: Principal, state?: 'pending' | 'approved' | 'rejected' | 'not_required') {
    this.access.platform(p, 'admin.access');
    return this.prisma.adminAction.findMany({ where: state ? { approvalState: state } : {}, orderBy: { createdAt: 'desc' }, take: 200 });
  }
}
