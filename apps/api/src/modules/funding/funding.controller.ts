import { Body, Controller, Get, Headers, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { CurrentPrincipal, RequirePlatformPermission } from '../../auth/decorators';
import type { Principal } from '../../auth/principal';
import { Idempotent } from '../../common/idempotency';
import { currencyCode, positiveMinor } from '../../common/validation';
import { FundingService } from './funding.service';

class FundingDto extends createZodDto(
  z.object({ amountMinor: positiveMinor, currency: currencyCode, fundingMethod: z.enum(['bank_transfer', 'sandbox']), providerReference: z.string().trim().max(200).optional() }),
) {}
class ConfirmDto extends createZodDto(z.object({ providerReference: z.string().trim().min(3).max(200) })) {}
class ReasonDto extends createZodDto(z.object({ reason: z.string().trim().min(3).max(1000) })) {}

@ApiTags('funding')
@Controller()
export class FundingController {
  constructor(private readonly svc: FundingService) {}

  @Idempotent('funding.create')
  @Post('businesses/:businessId/funding')
  create(@CurrentPrincipal() p: Principal, @Param('businessId', ParseUUIDPipe) businessId: string, @Body() dto: FundingDto, @Headers('idempotency-key') key: string) {
    return this.svc.create(p, businessId, dto, key);
  }

  @Get('businesses/:businessId/funding')
  overview(@CurrentPrincipal() p: Principal, @Param('businessId', ParseUUIDPipe) businessId: string) {
    return this.svc.overview(p, businessId);
  }

  @RequirePlatformPermission('admin.finance.operate')
  @Post('admin/fundings/:id/confirm')
  @HttpCode(200)
  confirm(@CurrentPrincipal() p: Principal, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ConfirmDto) {
    return this.svc.adminConfirm(p, id, dto.providerReference);
  }

  @RequirePlatformPermission('admin.finance.operate')
  @Post('admin/fundings/:id/fail')
  @HttpCode(200)
  fail(@CurrentPrincipal() p: Principal, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReasonDto) {
    return this.svc.adminFail(p, id, dto.reason);
  }
}
