import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { AllowUnverified, CurrentPrincipal, Public, RequirePlatformPermission } from '../../auth/decorators';
import type { Principal } from '../../auth/principal';
import { countryCode } from '../../common/validation';
import { LegalService } from './legal.service';

class AcceptDto extends createZodDto(z.object({ documentIds: z.array(z.uuid()).min(1).max(20) })) {}
class DraftDto extends createZodDto(
  z.object({
    documentType: z.enum(['terms_of_service', 'privacy_policy', 'business_agreement', 'creator_agreement', 'commission_terms', 'refund_dispute_policy', 'content_rights_terms', 'prohibited_categories']),
    version: z.string().trim().min(1).max(40),
    jurisdiction: countryCode.optional(),
    title: z.string().trim().min(3).max(200),
    content: z.string().min(20).max(200_000),
    requiredFor: z.array(z.enum(['business', 'creator'])).default([]),
  }),
) {}

@ApiTags('legal')
@Controller()
export class LegalController {
  constructor(private readonly svc: LegalService) {}

  @Public()
  @Get('legal/documents')
  list() {
    return this.svc.published();
  }

  @Public()
  @Get('legal/documents/:id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.svc.document(id);
  }

  @AllowUnverified()
  @Get('legal/pending')
  pending(@CurrentPrincipal() p: Principal) {
    return this.svc.pending(p);
  }

  @AllowUnverified()
  @Post('legal/accept')
  @HttpCode(200)
  accept(@CurrentPrincipal() p: Principal, @Body() dto: AcceptDto) {
    return this.svc.accept(p, dto.documentIds);
  }

  @RequirePlatformPermission('admin.legal.manage')
  @Get('admin/legal-documents')
  adminList() {
    return this.svc.adminList();
  }

  @RequirePlatformPermission('admin.legal.manage')
  @Post('admin/legal-documents')
  draft(@CurrentPrincipal() p: Principal, @Body() dto: DraftDto) {
    return this.svc.createDraft(p, dto);
  }

  @RequirePlatformPermission('admin.legal.manage')
  @Post('admin/legal-documents/:id/publish')
  @HttpCode(200)
  publish(@CurrentPrincipal() p: Principal, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.publish(p, id);
  }
}
