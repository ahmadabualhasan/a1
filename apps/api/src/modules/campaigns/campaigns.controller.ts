import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentPrincipal, OptionalPrincipal, Public, RequirePlatformPermission } from '../../auth/decorators';
import type { Principal } from '../../auth/principal';
import { CampaignsService } from './campaigns.service';
import { CampaignListQueryDto, CreateCampaignDto, MarketplaceQueryDto, ReasonDto, UpdateCampaignDto } from './campaigns.dto';

@ApiTags('campaigns')
@Controller()
export class CampaignsController {
  constructor(private readonly svc: CampaignsService) {}

  @Get('businesses/:businessId/campaigns')
  list(@CurrentPrincipal() p: Principal, @Param('businessId', ParseUUIDPipe) businessId: string, @Query() q: CampaignListQueryDto) {
    return this.svc.listForBusiness(p, businessId, q);
  }

  @Post('businesses/:businessId/campaigns')
  create(@CurrentPrincipal() p: Principal, @Param('businessId', ParseUUIDPipe) businessId: string, @Body() dto: CreateCampaignDto) {
    return this.svc.create(p, businessId, dto);
  }

  @Public()
  @Get('marketplace/campaigns')
  marketplace(@Query() q: MarketplaceQueryDto) {
    return this.svc.marketplace(q);
  }

  @Public()
  @Get('campaigns/:id')
  detail(@OptionalPrincipal() p: Principal | undefined, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.detail(p, id);
  }

  @Patch('campaigns/:id')
  update(@CurrentPrincipal() p: Principal, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCampaignDto) {
    return this.svc.update(p, id, dto);
  }

  @Post('campaigns/:id/publish')
  @HttpCode(200)
  publish(@CurrentPrincipal() p: Principal, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.publish(p, id);
  }

  @Post('campaigns/:id/pause')
  @HttpCode(200)
  pause(@CurrentPrincipal() p: Principal, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.pause(p, id);
  }

  @Post('campaigns/:id/resume')
  @HttpCode(200)
  resume(@CurrentPrincipal() p: Principal, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.resume(p, id);
  }

  @Post('campaigns/:id/end')
  @HttpCode(200)
  end(@CurrentPrincipal() p: Principal, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.end(p, id);
  }

  @Post('campaigns/:id/archive')
  @HttpCode(200)
  archive(@CurrentPrincipal() p: Principal, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.archive(p, id);
  }

  @RequirePlatformPermission('admin.campaigns.review')
  @Post('admin/campaigns/:id/approve')
  @HttpCode(200)
  approve(@CurrentPrincipal() p: Principal, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.adminApprove(p, id);
  }

  @RequirePlatformPermission('admin.campaigns.review')
  @Post('admin/campaigns/:id/reject')
  @HttpCode(200)
  reject(@CurrentPrincipal() p: Principal, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReasonDto) {
    return this.svc.adminReject(p, id, dto.reason);
  }
}
