import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { CurrentPrincipal } from '../../auth/decorators';
import type { Principal } from '../../auth/principal';
import { CreatorsService } from './creators.service';
import { CreateCreatorProfileDto, CreatorSearchDto, SocialAccountDto, UpdateCreatorProfileDto, UpdateSocialAccountDto } from './creators.dto';

@ApiTags('creators')
@Controller()
export class CreatorsController {
  constructor(private readonly svc: CreatorsService) {}

  @Get('creator/profile')
  me(@CurrentPrincipal() p: Principal) {
    return this.svc.myProfile(p);
  }

  @Post('creator/profile')
  create(@CurrentPrincipal() p: Principal, @Body() dto: CreateCreatorProfileDto) {
    return this.svc.createProfile(p, dto);
  }

  @Patch('creator/profile')
  update(@CurrentPrincipal() p: Principal, @Body() dto: UpdateCreatorProfileDto) {
    return this.svc.updateProfile(p, dto);
  }

  @Post('creator/verification')
  verification(@CurrentPrincipal() p: Principal, @Body() body: { notes?: string }) {
    return this.svc.requestVerification(p, z.object({ notes: z.string().max(2000).optional() }).parse(body ?? {}).notes);
  }

  @Get('creator/social-accounts')
  social(@CurrentPrincipal() p: Principal) {
    return this.svc.listSocial(p);
  }

  @Post('creator/social-accounts')
  addSocial(@CurrentPrincipal() p: Principal, @Body() dto: SocialAccountDto) {
    return this.svc.addSocial(p, dto);
  }

  @Patch('creator/social-accounts/:id')
  updateSocial(@CurrentPrincipal() p: Principal, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateSocialAccountDto) {
    return this.svc.updateSocial(p, id, dto);
  }

  @Delete('creator/social-accounts/:id')
  @HttpCode(200)
  removeSocial(@CurrentPrincipal() p: Principal, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.removeSocial(p, id);
  }

  @Get('creators')
  search(@CurrentPrincipal() p: Principal, @Query() q: CreatorSearchDto) {
    return this.svc.search(p, q);
  }

  @Get('creators/:id')
  profile(@CurrentPrincipal() p: Principal, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.publicProfile(p, id);
  }
}
