import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentPrincipal } from '../../auth/decorators';
import type { Principal } from '../../auth/principal';
import { BusinessesService } from './businesses.service';
import { CreateBusinessDto, InviteMemberDto, UpdateBusinessDto, VerificationRequestDto } from './businesses.dto';

@ApiTags('businesses')
@Controller('businesses')
export class BusinessesController {
  constructor(private readonly svc: BusinessesService) {}

  @Get()
  list(@CurrentPrincipal() p: Principal) {
    return this.svc.listMine(p);
  }

  @Post()
  create(@CurrentPrincipal() p: Principal, @Body() dto: CreateBusinessDto) {
    return this.svc.create(p, dto);
  }

  @Get(':id')
  get(@CurrentPrincipal() p: Principal, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.get(p, id);
  }

  @Patch(':id')
  update(@CurrentPrincipal() p: Principal, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateBusinessDto) {
    return this.svc.update(p, id, dto);
  }

  @Post(':id/verification')
  verification(@CurrentPrincipal() p: Principal, @Param('id', ParseUUIDPipe) id: string, @Body() dto: VerificationRequestDto) {
    return this.svc.requestVerification(p, id, dto);
  }

  @Get(':id/members')
  members(@CurrentPrincipal() p: Principal, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.members(p, id);
  }

  @Post(':id/members')
  invite(@CurrentPrincipal() p: Principal, @Param('id', ParseUUIDPipe) id: string, @Body() dto: InviteMemberDto) {
    return this.svc.inviteMember(p, id, dto.email, dto.role);
  }

  @Post(':id/members/:memberId/revoke')
  @HttpCode(200)
  revoke(@CurrentPrincipal() p: Principal, @Param('id', ParseUUIDPipe) id: string, @Param('memberId', ParseUUIDPipe) memberId: string) {
    return this.svc.revokeMember(p, id, memberId);
  }
}
