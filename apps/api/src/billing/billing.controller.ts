import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { CurrentPrincipal, Public, RequirePlatformPermission } from '../auth/decorators';
import type { Principal } from '../auth/principal';
import { currencyCode, minorAmount } from '../common/validation';
import { BillingService } from './billing.service';

const rate = z.string().regex(/^(0(\.\d{1,6})?|1(\.0{1,6})?)$/);
class SubscribeDto extends createZodDto(z.object({ planKey: z.string().min(2).max(60) })) {}
class PlanDto extends createZodDto(
  z.object({
    planKey: z.string().regex(/^[a-z0-9_-]{2,60}$/),
    name: z.string().trim().min(2).max(100),
    description: z.string().trim().max(1000).optional(),
    monthlyPriceMinor: minorAmount.optional(),
    currency: currencyCode.optional(),
    feePlan: z.object({ basis: z.enum(['none', 'percentage_of_commission', 'percentage_of_sale']), rate: rate.nullable().optional(), roundingMode: z.enum(['half_up', 'half_even', 'floor', 'ceil']).default('half_up') }),
  }),
) {}
class ActiveDto extends createZodDto(z.object({ active: z.boolean() })) {}

@ApiTags('billing')
@Controller()
export class BillingController {
  constructor(private readonly svc: BillingService) {}

  @Public()
  @Get('pricing')
  pricing() {
    return this.svc.publicPlans();
  }

  @Get('businesses/:businessId/billing')
  overview(@CurrentPrincipal() p: Principal, @Param('businessId', ParseUUIDPipe) businessId: string) {
    return this.svc.overview(p, businessId);
  }

  @Post('businesses/:businessId/billing/subscribe')
  subscribe(@CurrentPrincipal() p: Principal, @Param('businessId', ParseUUIDPipe) businessId: string, @Body() dto: SubscribeDto) {
    return this.svc.subscribe(p, businessId, dto.planKey);
  }

  @RequirePlatformPermission('admin.settings.manage')
  @Post('admin/pricing-plans')
  create(@CurrentPrincipal() p: Principal, @Body() dto: PlanDto) {
    return this.svc.createPlan(p, { ...dto, feePlan: { planKey: dto.planKey, basis: dto.feePlan.basis, rate: dto.feePlan.rate ?? null, roundingMode: dto.feePlan.roundingMode } });
  }

  @RequirePlatformPermission('admin.settings.manage')
  @Post('admin/pricing-plans/:planKey/active')
  @HttpCode(200)
  active(@CurrentPrincipal() p: Principal, @Param('planKey') planKey: string, @Body() dto: ActiveDto) {
    return this.svc.setPlanActive(p, planKey, dto.active);
  }
}
