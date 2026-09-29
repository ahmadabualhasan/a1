import { Global, Inject, Injectable, Module } from '@nestjs/common';
import type { PrismaClient, TransactionClient } from '@codek/database';
import { validateFeePlan, type FeePlan } from '@codek/domain';
import { PRISMA } from '../prisma/prisma.service';

/**
 * Resolves the CODEK fee plan that applies to a business at the time a partnership is created.
 * The resolved plan is frozen into the partnership snapshot so later pricing changes never rewrite history.
 */
@Injectable()
export class FeePlanService {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  async currentFor(businessId: string, tx: TransactionClient | PrismaClient = this.prisma): Promise<FeePlan> {
    const sub = await tx.billingSubscription.findFirst({ where: { businessId, status: 'active' }, orderBy: { createdAt: 'desc' } });
    const plan = sub ? (sub.feePlanSnapshot as unknown as FeePlan) : ((await tx.pricingPlan.findFirst({ where: { isDefault: true, active: true } }))?.feePlanJson as unknown as FeePlan | undefined);
    const resolved: FeePlan = plan ?? { planKey: 'none', basis: 'none', rate: null, roundingMode: 'half_up' };
    validateFeePlan(resolved);
    return resolved;
  }
}

@Global()
@Module({ providers: [FeePlanService], exports: [FeePlanService] })
export class FeePlanModule {}
