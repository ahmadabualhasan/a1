import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { CurrentPrincipal } from '../../auth/decorators';
import type { Principal } from '../../auth/principal';
import { PromotionService } from './promotion.service';

class CodeStatusDto extends createZodDto(z.object({ reason: z.string().trim().min(3).max(500) })) {}

@ApiTags('promotion')
@Controller()
export class PromotionController {
  constructor(private readonly svc: PromotionService) {}

  @Get('creator/promotion-assets')
  assets(@CurrentPrincipal() p: Principal) {
    return this.svc.creatorAssets(p);
  }

  @Post('promotion-codes/:id/pause')
  @HttpCode(200)
  pause(@CurrentPrincipal() p: Principal, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CodeStatusDto) {
    return this.svc.changeCodeStatus(p, id, 'paused', dto.reason);
  }

  @Post('promotion-codes/:id/resume')
  @HttpCode(200)
  resume(@CurrentPrincipal() p: Principal, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CodeStatusDto) {
    return this.svc.changeCodeStatus(p, id, 'active', dto.reason);
  }

  @Post('promotion-codes/:id/revoke')
  @HttpCode(200)
  revoke(@CurrentPrincipal() p: Principal, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CodeStatusDto) {
    return this.svc.changeCodeStatus(p, id, 'revoked', dto.reason);
  }
}
