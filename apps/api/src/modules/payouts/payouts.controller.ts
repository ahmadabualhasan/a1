import { Body, Controller, Get, Headers, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { CurrentPrincipal, RequirePlatformPermission } from '../../auth/decorators';
import type { Principal } from '../../auth/principal';
import { Idempotent } from '../../common/idempotency';
import { paginationSchema } from '../../common/pagination';
import { RateLimit } from '../../common/rate-limit';
import { currencyCode, positiveMinor } from '../../common/validation';
import { PayoutsService } from './payouts.service';

class PayoutRequestDto extends createZodDto(z.object({ currency: currencyCode, amountMinor: positiveMinor.optional() })) {}
class PayoutMethodDto extends createZodDto(z.object({ type: z.literal('paypal'), email: z.email().max(254) })) {}
class PageDto extends createZodDto(paginationSchema) {}

@ApiTags('payouts')
@Controller()
export class PayoutsController {
  constructor(private readonly svc: PayoutsService) {}

  @Get('creator/earnings')
  earnings(@CurrentPrincipal() p: Principal) {
    return this.svc.earnings(p);
  }

  @Get('creator/payouts')
  list(@CurrentPrincipal() p: Principal, @Query() q: PageDto) {
    return this.svc.list(p, q);
  }

  @Patch('creator/payout-method')
  method(@CurrentPrincipal() p: Principal, @Body() dto: PayoutMethodDto) {
    return this.svc.setPayoutMethod(p, dto);
  }

  @RateLimit({ bucket: 'payout.request', limit: 10, windowSeconds: 3600 })
  @Idempotent('payout.request')
  @Post('creator/payouts/request')
  request(@CurrentPrincipal() p: Principal, @Body() dto: PayoutRequestDto, @Headers('idempotency-key') key: string) {
    return this.svc.request(p, dto, key);
  }

  /** Alias of spec §20.4 `POST /creator/payouts`. */
  @RateLimit({ bucket: 'payout.request', limit: 10, windowSeconds: 3600 })
  @Idempotent('payout.request')
  @Post('creator/payouts')
  requestAlias(@CurrentPrincipal() p: Principal, @Body() dto: PayoutRequestDto, @Headers('idempotency-key') key: string) {
    return this.svc.request(p, dto, key);
  }

  @Post('creator/payouts/:id/cancel')
  @HttpCode(200)
  cancel(@CurrentPrincipal() p: Principal, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.cancel(p, id);
  }

  @RequirePlatformPermission('admin.finance.operate')
  @Post('admin/payouts/:id/process')
  @HttpCode(200)
  process(@Param('id', ParseUUIDPipe) id: string) {
    return this.svc.process(id);
  }
}
