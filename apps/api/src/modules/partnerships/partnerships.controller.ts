import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { CurrentPrincipal } from '../../auth/decorators';
import type { Principal } from '../../auth/principal';
import { paginationSchema } from '../../common/pagination';
import { ApplicationsService } from './applications.service';
import { PartnershipsService } from './partnerships.service';

class ApplyDto extends createZodDto(z.object({ message: z.string().trim().max(2000).optional() })) {}
class RejectDto extends createZodDto(z.object({ reason: z.string().trim().max(1000).optional() })) {}
class ReasonDto extends createZodDto(z.object({ reason: z.string().trim().max(1000).optional() })) {}
class InviteDto extends createZodDto(
  z.object({ creatorId: z.uuid(), campaignId: z.uuid(), message: z.string().trim().max(2000).optional(), expiresInDays: z.number().int().min(1).max(60).optional() }),
) {}
class AppQueryDto extends createZodDto(
  paginationSchema.extend({ campaignId: z.uuid().optional(), status: z.enum(['pending', 'waitlisted', 'accepted', 'rejected', 'withdrawn', 'expired']).optional() }),
) {}
class PartnershipQueryDto extends createZodDto(
  paginationSchema.extend({ campaignId: z.uuid().optional(), status: z.enum(['pending', 'active', 'paused', 'completed', 'cancelled', 'disputed', 'terminated']).optional() }),
) {}
class PageDto extends createZodDto(paginationSchema) {}

@ApiTags('applications-partnerships')
@Controller()
export class PartnershipsController {
  constructor(
    private readonly apps: ApplicationsService,
    private readonly partnerships: PartnershipsService,
  ) {}

  @Post('campaigns/:id/apply')
  apply(@CurrentPrincipal() p: Principal, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ApplyDto) {
    return this.apps.apply(p, id, dto.message);
  }

  @Get('creator/applications')
  myApplications(@CurrentPrincipal() p: Principal, @Query() q: PageDto) {
    return this.apps.creatorApplications(p, q);
  }

  @Post('applications/:id/withdraw')
  @HttpCode(200)
  withdraw(@CurrentPrincipal() p: Principal, @Param('id', ParseUUIDPipe) id: string) {
    return this.apps.withdraw(p, id);
  }

  @Get('businesses/:businessId/applications')
  businessApplications(@CurrentPrincipal() p: Principal, @Param('businessId', ParseUUIDPipe) businessId: string, @Query() q: AppQueryDto) {
    return this.apps.businessApplications(p, businessId, q);
  }

  @Post('applications/:id/accept')
  @HttpCode(200)
  accept(@CurrentPrincipal() p: Principal, @Param('id', ParseUUIDPipe) id: string) {
    return this.apps.accept(p, id);
  }

  @Post('applications/:id/reject')
  @HttpCode(200)
  reject(@CurrentPrincipal() p: Principal, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RejectDto) {
    return this.apps.reject(p, id, dto.reason);
  }

  @Post('businesses/:businessId/invitations')
  invite(@CurrentPrincipal() p: Principal, @Param('businessId', ParseUUIDPipe) businessId: string, @Body() dto: InviteDto) {
    return this.apps.invite(p, businessId, dto);
  }

  @Get('businesses/:businessId/invitations')
  businessInvitations(@CurrentPrincipal() p: Principal, @Param('businessId', ParseUUIDPipe) businessId: string) {
    return this.apps.businessInvitations(p, businessId);
  }

  @Get('creator/invitations')
  myInvitations(@CurrentPrincipal() p: Principal) {
    return this.apps.creatorInvitations(p);
  }

  @Post('invitations/:id/accept')
  @HttpCode(200)
  acceptInvitation(@CurrentPrincipal() p: Principal, @Param('id', ParseUUIDPipe) id: string) {
    return this.apps.respondToInvitation(p, id, 'accepted');
  }

  @Post('invitations/:id/decline')
  @HttpCode(200)
  declineInvitation(@CurrentPrincipal() p: Principal, @Param('id', ParseUUIDPipe) id: string) {
    return this.apps.respondToInvitation(p, id, 'declined');
  }

  @Post('invitations/:id/revoke')
  @HttpCode(200)
  revokeInvitation(@CurrentPrincipal() p: Principal, @Param('id', ParseUUIDPipe) id: string) {
    return this.apps.revokeInvitation(p, id);
  }

  @Get('creator/partnerships')
  myPartnerships(@CurrentPrincipal() p: Principal, @Query() q: PartnershipQueryDto) {
    return this.partnerships.creatorPartnerships(p, q);
  }

  @Get('businesses/:businessId/partnerships')
  businessPartnerships(@CurrentPrincipal() p: Principal, @Param('businessId', ParseUUIDPipe) businessId: string, @Query() q: PartnershipQueryDto) {
    return this.partnerships.businessPartnerships(p, businessId, q);
  }

  @Get('partnerships/:id')
  detail(@CurrentPrincipal() p: Principal, @Param('id', ParseUUIDPipe) id: string) {
    return this.partnerships.detail(p, id);
  }

  @Post('partnerships/:id/confirm')
  @HttpCode(200)
  confirm(@CurrentPrincipal() p: Principal, @Param('id', ParseUUIDPipe) id: string) {
    return this.partnerships.confirm(p, id);
  }

  @Post('partnerships/:id/pause')
  @HttpCode(200)
  pause(@CurrentPrincipal() p: Principal, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReasonDto) {
    return this.partnerships.changeStatus(p, id, 'paused', dto.reason);
  }

  @Post('partnerships/:id/resume')
  @HttpCode(200)
  resume(@CurrentPrincipal() p: Principal, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReasonDto) {
    return this.partnerships.changeStatus(p, id, 'active', dto.reason);
  }

  @Post('partnerships/:id/complete')
  @HttpCode(200)
  complete(@CurrentPrincipal() p: Principal, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReasonDto) {
    return this.partnerships.changeStatus(p, id, 'completed', dto.reason);
  }

  @Post('partnerships/:id/terminate')
  @HttpCode(200)
  terminate(@CurrentPrincipal() p: Principal, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReasonDto) {
    return this.partnerships.changeStatus(p, id, 'terminated', dto.reason);
  }

  @Post('partnerships/:id/cancel')
  @HttpCode(200)
  cancel(@CurrentPrincipal() p: Principal, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReasonDto) {
    return this.partnerships.changeStatus(p, id, 'cancelled', dto.reason);
  }
}
