import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { CurrentPrincipal, RequirePlatformPermission } from '../../auth/decorators';
import type { Principal } from '../../auth/principal';
import { paginationSchema } from '../../common/pagination';
import { RateLimit } from '../../common/rate-limit';
import { currencyCode, isoDate, minorAmount } from '../../common/validation';
import { ConversionsQueryService } from './conversions.query';

const redemptionBase = {
  promotionCode: z.string().trim().min(3).max(64),
  externalRef: z.string().trim().min(1).max(200),
  occurredAt: isoDate.optional(),
  currency: currencyCode.optional(),
  grossMinor: minorAmount.optional(),
  discountMinor: minorAmount.optional(),
  taxMinor: minorAmount.optional(),
  conversionType: z.enum(['sale', 'booking', 'redemption']).optional(),
  customerRef: z.string().max(255).optional(),
};
class RedemptionDto extends createZodDto(z.object({ businessId: z.uuid(), ...redemptionBase }).refine((v) => v.grossMinor == null || !!v.currency, { message: 'currency is required with amounts', path: ['currency'] })) {}
class ManualDto extends createZodDto(z.object({ ...redemptionBase, evidenceNote: z.string().trim().min(10).max(2000) })) {}
class ListDto extends createZodDto(
  paginationSchema.extend({
    status: z.enum(['received', 'validated', 'attributed', 'approved', 'rejected', 'cancelled', 'refunded', 'partially_refunded', 'reversed']).optional(),
    verifiedState: z.enum(['verified', 'self_reported', 'unknown']).optional(),
    campaignId: z.uuid().optional(),
    partnershipId: z.uuid().optional(),
  }),
) {}
class ReasonDto extends createZodDto(z.object({ reason: z.string().trim().min(3).max(1000) })) {}
class PageDto extends createZodDto(paginationSchema) {}

@ApiTags('conversions')
@Controller()
export class ConversionsController {
  constructor(private readonly svc: ConversionsQueryService) {}

  @RateLimit({ bucket: 'redemptions', limit: 60, windowSeconds: 60 })
  @Post('redemptions')
  redeem(@CurrentPrincipal() p: Principal, @Body() dto: RedemptionDto) {
    return this.svc.redeem(p, dto);
  }

  @Post('businesses/:businessId/conversions/manual')
  manual(@CurrentPrincipal() p: Principal, @Param('businessId', ParseUUIDPipe) businessId: string, @Body() dto: ManualDto) {
    return this.svc.manualEntry(p, businessId, dto);
  }

  @Get('businesses/:businessId/conversions')
  list(@CurrentPrincipal() p: Principal, @Param('businessId', ParseUUIDPipe) businessId: string, @Query() q: ListDto) {
    return this.svc.listForBusiness(p, businessId, q);
  }

  @Get('creator/sales')
  sales(@CurrentPrincipal() p: Principal, @Query() q: PageDto) {
    return this.svc.creatorSales(p, q);
  }

  @Get('conversions/:id')
  get(@CurrentPrincipal() p: Principal, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.get(p, id);
  }

  @Get('attributions/:conversionId')
  attribution(@CurrentPrincipal() p: Principal, @Param('conversionId', ParseUUIDPipe) id: string) {
    return this.svc.attribution(p, id);
  }

  @Post('conversions/:id/approve')
  @HttpCode(200)
  approve(@CurrentPrincipal() p: Principal, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.approve(p, id);
  }

  @Post('conversions/:id/reject')
  @HttpCode(200)
  reject(@CurrentPrincipal() p: Principal, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReasonDto) {
    return this.svc.reject(p, id, dto.reason);
  }

  @RequirePlatformPermission('admin.conversions.manage')
  @Post('admin/conversions/:id/approve')
  @HttpCode(200)
  adminApprove(@CurrentPrincipal() p: Principal, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReasonDto) {
    return this.svc.adminApprove(p, id, dto.reason);
  }
}
