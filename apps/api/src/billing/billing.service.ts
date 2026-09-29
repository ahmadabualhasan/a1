import { Inject, Injectable } from '@nestjs/common';
import type { PrismaClient } from '@codek/database';
import { assertSupportedCurrency, validateFeePlan, type FeePlan } from '@codek/domain';
import { PRISMA } from '../prisma/prisma.service';
import { AccessService } from '../access/access.service';
import { AuditService } from '../audit/audit.service';
import { SettingsService } from '../settings/settings.service';
import { ApiError, notFound, ruleViolation } from '../common/errors';
import type { Principal } from '../auth/principal';
import { FeePlanService } from './fee-plan.service';

/**
 * Billing & pricing (spec §3.7, phase 16). Pricing is a pending commercial decision (D-003): the seeded default plan
 * charges no fee and subscriptions are behind the `billing.subscriptions.enabled` flag. Fee plans are frozen into
 * partnership snapshots, so plan changes never rewrite existing commissions. Subscription invoices are issued by the
 * internal provider; payment collection requires a billing provider decision (CREDENTIAL_REQUIRED).
 */
@Injectable()
export class BillingService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
    private readonly feePlans: FeePlanService,
  ) {}

  /** Public, transparent pricing (shown before commitment). */
  async publicPlans() {
    const plans = await this.prisma.pricingPlan.findMany({ where: { active: true }, orderBy: { createdAt: 'asc' } });
    return plans.map((p) => ({ planKey: p.planKey, name: p.name, description: p.description, monthlyPriceMinor: p.monthlyPriceMinor, currency: p.currency, fee: describeFee(p.feePlanJson as unknown as FeePlan), isDefault: p.isDefault }));
  }

  async overview(p: Principal, businessId: string) {
    this.access.businessAccess(p, businessId, 'funding.read');
    const [customer, subscription, invoices, fee] = await Promise.all([
      this.prisma.billingCustomer.findUnique({ where: { businessId } }),
      this.prisma.billingSubscription.findFirst({ where: { businessId, status: 'active' }, orderBy: { createdAt: 'desc' } }),
      this.prisma.billingInvoice.findMany({ where: { businessId }, orderBy: { createdAt: 'desc' }, take: 24 }),
      this.feePlans.currentFor(businessId),
    ]);
    return { customer, subscription, invoices, currentFeePlan: { ...fee, description: describeFee(fee) }, subscriptionsEnabled: await this.settings.flag('billing.subscriptions.enabled') };
  }

  async subscribe(p: Principal, businessId: string, planKey: string) {
    this.access.businessAccess(p, businessId, 'funding.manage');
    if (!(await this.settings.flag('billing.subscriptions.enabled'))) throw new ApiError('FEATURE_DISABLED', 'Subscriptions are not available yet');
    const plan = await this.prisma.pricingPlan.findUnique({ where: { planKey } });
    if (!plan || !plan.active) throw notFound('Plan');
    return this.prisma.$transaction(async (tx) => {
      const customer = await tx.billingCustomer.upsert({ where: { businessId }, update: {}, create: { businessId, provider: 'internal', status: 'active' } });
      await tx.billingSubscription.updateMany({ where: { businessId, status: 'active' }, data: { status: 'replaced', periodEnd: new Date() } });
      const now = new Date();
      const sub = await tx.billingSubscription.create({
        data: { billingCustomerId: customer.id, businessId, provider: 'internal', planKey, status: 'active', feePlanSnapshot: plan.feePlanJson as object, periodStart: now, periodEnd: new Date(now.getTime() + 30 * 86400000) },
      });
      await tx.business.update({ where: { id: businessId }, data: { billingReady: true } });
      await this.audit.record({ actorUserId: p.userId, businessId, action: 'billing.subscribed', objectType: 'billing_subscription', objectId: sub.id, after: { planKey, feePlan: plan.feePlanJson } }, tx);
      return sub;
    });
  }

  // ─────────────── Admin ───────────────

  async createPlan(p: Principal, dto: { planKey: string; name: string; description?: string; monthlyPriceMinor?: number; currency?: string; feePlan: FeePlan }) {
    validateFeePlan(dto.feePlan);
    if (dto.currency) assertSupportedCurrency(dto.currency);
    if (dto.monthlyPriceMinor != null && !dto.currency) throw ruleViolation('A currency is required with a monthly price');
    const plan = await this.prisma.pricingPlan.create({
      data: { planKey: dto.planKey, name: dto.name, description: dto.description, monthlyPriceMinor: dto.monthlyPriceMinor != null ? BigInt(dto.monthlyPriceMinor) : null, currency: dto.currency, feePlanJson: { ...dto.feePlan, planKey: dto.planKey } },
    });
    await this.audit.record({ actorUserId: p.userId, actorType: 'admin', action: 'billing.plan_created', objectType: 'pricing_plan', objectId: plan.id, after: plan });
    return plan;
  }

  async setPlanActive(p: Principal, planKey: string, active: boolean) {
    const plan = await this.prisma.pricingPlan.findUnique({ where: { planKey } });
    if (!plan) throw notFound('Plan');
    if (plan.isDefault && !active) throw ruleViolation('The default plan cannot be deactivated');
    const updated = await this.prisma.pricingPlan.update({ where: { planKey }, data: { active } });
    await this.audit.record({ actorUserId: p.userId, actorType: 'admin', action: `billing.plan_${active ? 'activated' : 'deactivated'}`, objectType: 'pricing_plan', objectId: plan.id });
    return updated;
  }

  /** Monthly invoice generation for active subscriptions (idempotent per subscription period). */
  async generateInvoices(now = new Date()): Promise<number> {
    const due = await this.prisma.billingSubscription.findMany({ where: { status: 'active', periodEnd: { lte: now } } });
    let issued = 0;
    for (const sub of due) {
      const plan = await this.prisma.pricingPlan.findUnique({ where: { planKey: sub.planKey } });
      await this.prisma.$transaction(async (tx) => {
        const exists = await tx.billingInvoice.findFirst({ where: { billingCustomerId: sub.billingCustomerId, periodStart: sub.periodStart, periodEnd: sub.periodEnd } });
        if (!exists && plan?.monthlyPriceMinor && plan.currency) {
          await tx.billingInvoice.create({
            data: { billingCustomerId: sub.billingCustomerId, businessId: sub.businessId, provider: 'internal', status: 'issued', amountMinor: plan.monthlyPriceMinor, currency: plan.currency, periodStart: sub.periodStart, periodEnd: sub.periodEnd, lineItems: [{ description: `${plan.name} subscription`, amountMinor: plan.monthlyPriceMinor.toString() }] },
          });
          issued++;
        }
        const start = sub.periodEnd ?? now;
        await tx.billingSubscription.update({ where: { id: sub.id }, data: { periodStart: start, periodEnd: new Date(start.getTime() + 30 * 86400000) } });
      });
    }
    return issued;
  }
}

export function describeFee(f: FeePlan): string {
  if (f.basis === 'none') return 'No CODEK fee on commissions';
  const pct = `${(Number(f.rate) * 100).toFixed(2).replace(/\.?0+$/, '')}%`;
  return f.basis === 'percentage_of_commission' ? `${pct} of each creator commission` : `${pct} of each attributed sale`;
}
