import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { CurrentPrincipal } from '../../auth/decorators';
import type { Principal } from '../../auth/principal';
import { httpsUrl, isoDate } from '../../common/validation';
import { DeliverablesService } from './deliverables.service';

class AddDto extends createZodDto(z.object({ type: z.string().trim().min(2).max(60), description: z.string().trim().max(1000).optional(), dueAt: isoDate.optional(), required: z.boolean().default(true) })) {}
class SubmitDto extends createZodDto(z.object({ url: httpsUrl.optional(), fileId: z.uuid().optional(), caption: z.string().trim().max(2200).optional() })) {}
class ReviewDto extends createZodDto(z.object({ decision: z.enum(['approved', 'changes_requested']), note: z.string().trim().max(2000).optional() })) {}

@ApiTags('deliverables')
@Controller()
export class DeliverablesController {
  constructor(private readonly svc: DeliverablesService) {}

  @Get('partnerships/:id/deliverables')
  list(@CurrentPrincipal() p: Principal, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.list(p, id);
  }

  @Post('partnerships/:id/deliverables')
  add(@CurrentPrincipal() p: Principal, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AddDto) {
    return this.svc.add(p, id, dto);
  }

  @Post('deliverables/:id/submissions')
  submit(@CurrentPrincipal() p: Principal, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SubmitDto) {
    return this.svc.submit(p, id, dto);
  }

  @Post('submissions/:id/review')
  @HttpCode(200)
  review(@CurrentPrincipal() p: Principal, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReviewDto) {
    return this.svc.review(p, id, dto.decision, dto.note);
  }
}
