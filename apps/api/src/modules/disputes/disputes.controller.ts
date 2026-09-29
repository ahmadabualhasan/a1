import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { CurrentPrincipal, RequirePlatformPermission } from '../../auth/decorators';
import type { Principal } from '../../auth/principal';
import { httpsUrl } from '../../common/validation';
import { DisputesService } from './disputes.service';

class OpenDto extends createZodDto(
  z.object({ type: z.enum(['attribution', 'commission_amount', 'refund', 'deliverable', 'payment', 'other']), summary: z.string().trim().min(10).max(4000), partnershipId: z.uuid().optional(), conversionId: z.uuid().optional() }),
) {}
class EvidenceDto extends createZodDto(z.object({ description: z.string().trim().max(4000).optional(), externalUrl: httpsUrl.optional(), fileId: z.uuid().optional() })) {}
class TransitionDto extends createZodDto(
  z.object({
    to: z.enum(['evidence', 'hold', 'review', 'decision', 'adjustment', 'closed']),
    reason: z.string().trim().min(3).max(2000),
    decisionCode: z.enum(['uphold_creator', 'uphold_business', 'partial']).optional(),
    reverseCommission: z.boolean().optional(),
  }),
) {}

@ApiTags('disputes')
@Controller()
export class DisputesController {
  constructor(private readonly svc: DisputesService) {}

  @Post('disputes')
  open(@CurrentPrincipal() p: Principal, @Body() dto: OpenDto) {
    return this.svc.open(p, dto);
  }

  @Get('disputes')
  list(@CurrentPrincipal() p: Principal) {
    return this.svc.listMine(p);
  }

  @Get('disputes/:id')
  get(@CurrentPrincipal() p: Principal, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.get(p, id);
  }

  @Post('disputes/:id/evidence')
  evidence(@CurrentPrincipal() p: Principal, @Param('id', ParseUUIDPipe) id: string, @Body() dto: EvidenceDto) {
    return this.svc.addEvidence(p, id, dto);
  }

  @RequirePlatformPermission('admin.disputes.manage')
  @Get('admin/disputes')
  adminList(@Query('status') status?: string) {
    return this.svc.adminList(status);
  }

  @RequirePlatformPermission('admin.disputes.manage')
  @Post('admin/disputes/:id/transition')
  @HttpCode(200)
  transition(@CurrentPrincipal() p: Principal, @Param('id', ParseUUIDPipe) id: string, @Body() dto: TransitionDto) {
    return this.svc.transition(p, id, dto.to, dto.reason, { decisionCode: dto.decisionCode, reverseCommission: dto.reverseCommission });
  }
}
