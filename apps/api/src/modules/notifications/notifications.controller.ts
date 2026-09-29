import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { AllowUnverified, CurrentPrincipal } from '../../auth/decorators';
import type { Principal } from '../../auth/principal';
import { paginationSchema } from '../../common/pagination';
import { NotificationsService } from './notifications.service';

class ListDto extends createZodDto(paginationSchema.extend({ unreadOnly: z.enum(['true', 'false']).transform((v) => v === 'true').optional() })) {}
class PrefDto extends createZodDto(z.object({ inApp: z.boolean(), email: z.boolean() })) {}

@ApiTags('notifications')
@Controller()
export class NotificationsController {
  constructor(private readonly svc: NotificationsService) {}

  @Get('notifications')
  list(@CurrentPrincipal() p: Principal, @Query() q: ListDto) {
    return this.svc.list(p, q);
  }

  @AllowUnverified()
  @Get('notifications/unread-count')
  unread(@CurrentPrincipal() p: Principal) {
    return this.svc.unreadCount(p);
  }

  @Post('notifications/:id/read')
  @HttpCode(200)
  read(@CurrentPrincipal() p: Principal, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.markRead(p, id);
  }

  @Post('notifications/read-all')
  @HttpCode(200)
  readAll(@CurrentPrincipal() p: Principal) {
    return this.svc.markAllRead(p);
  }

  @Get('notification-preferences')
  prefs(@CurrentPrincipal() p: Principal) {
    return this.svc.preferences(p);
  }

  @Put('notification-preferences/:type')
  setPref(@CurrentPrincipal() p: Principal, @Param('type') type: string, @Body() dto: PrefDto) {
    return this.svc.setPreference(p, type, dto);
  }
}
