import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { CurrentPrincipal, RequirePlatformPermission } from '../../auth/decorators';
import type { Principal } from '../../auth/principal';
import { isoDate } from '../../common/validation';
import { MessagingService } from './messaging.service';

class SendDto extends createZodDto(z.object({ body: z.string().max(4000).optional(), fileId: z.uuid().optional() })) {}
class ListDto extends createZodDto(z.object({ before: isoDate.optional(), limit: z.coerce.number().int().min(1).max(100).default(50) })) {}
class ReportDto extends createZodDto(z.object({ reason: z.string().trim().min(3).max(1000) })) {}
class ModerateDto extends createZodDto(z.object({ action: z.enum(['hide', 'dismiss']), note: z.string().trim().min(3).max(1000) })) {}

@ApiTags('messaging')
@Controller()
export class MessagingController {
  constructor(private readonly svc: MessagingService) {}

  @Get('partnerships/:id/messages')
  list(@CurrentPrincipal() p: Principal, @Param('id', ParseUUIDPipe) id: string, @Query() q: ListDto) {
    return this.svc.list(p, id, q.before, q.limit);
  }

  @Post('partnerships/:id/messages')
  send(@CurrentPrincipal() p: Principal, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SendDto) {
    return this.svc.send(p, id, dto);
  }

  @Delete('messages/:id')
  @HttpCode(200)
  remove(@CurrentPrincipal() p: Principal, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.deleteOwn(p, id);
  }

  @Post('messages/:id/report')
  report(@CurrentPrincipal() p: Principal, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReportDto) {
    return this.svc.report(p, id, dto.reason);
  }

  @RequirePlatformPermission('admin.moderation.manage')
  @Get('admin/moderation/message-reports')
  reports(@CurrentPrincipal() p: Principal) {
    return this.svc.reports(p);
  }

  @RequirePlatformPermission('admin.moderation.manage')
  @Post('admin/moderation/messages/:id')
  @HttpCode(200)
  moderate(@CurrentPrincipal() p: Principal, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ModerateDto) {
    return this.svc.moderate(p, id, dto.action, dto.note);
  }
}
