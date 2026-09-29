import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, Req, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { CurrentPrincipal, Public, RequirePlatformPermission } from '../../auth/decorators';
import type { Principal } from '../../auth/principal';
import { RawResponse } from '../../common/envelope.interceptor';
import { ApiError } from '../../common/errors';
import { RateLimit } from '../../common/rate-limit';
import { currencyCode, isoDate } from '../../common/validation';
import { IntegrationsService } from './integrations.service';
import { ReconciliationService } from './reconciliation.service';
import { WebhooksService } from './webhooks.service';

class ConnectDto extends createZodDto(
  z.object({ businessId: z.uuid(), displayName: z.string().trim().min(2).max(100).optional(), config: z.record(z.string(), z.unknown()).default({}), credentials: z.record(z.string(), z.string()).default({}) }),
) {}
const statementOrder = z.object({
  externalRef: z.string().min(1).max(255),
  occurredAt: isoDate,
  currency: currencyCode,
  grossMinor: z.number().int().nonnegative().transform((v) => BigInt(v)),
  discountCodes: z.array(z.string().max(64)).max(20).default([]),
  referralClickId: z.string().max(64).nullish(),
  cancelled: z.boolean().optional(),
});
class ReconcileDto extends createZodDto(z.object({ scopeStart: isoDate, scopeEnd: isoDate, statement: z.array(statementOrder).max(10_000).optional() })) {}
class ListQuery extends createZodDto(z.object({ businessId: z.uuid() })) {}
class ResolveDto extends createZodDto(z.object({ resolution: z.enum(['accepted_difference', 'event_replayed', 'adjustment_requested', 'false_positive']), note: z.string().trim().min(3).max(1000) })) {}

@ApiTags('integrations')
@Controller()
export class IntegrationsController {
  constructor(
    private readonly svc: IntegrationsService,
    private readonly webhooks: WebhooksService,
    private readonly recon: ReconciliationService,
  ) {}

  @Get('integrations/providers')
  providers() {
    return this.svc.providers();
  }

  @Get('integrations')
  list(@CurrentPrincipal() p: Principal, @Query() q: ListQuery) {
    return this.svc.list(p, q.businessId);
  }

  @Post('integrations/:provider/connect')
  connect(@CurrentPrincipal() p: Principal, @Param('provider') provider: string, @Body() dto: ConnectDto) {
    return this.svc.connect(p, provider, dto);
  }

  @Post('integrations/:id/test')
  @HttpCode(200)
  test(@CurrentPrincipal() p: Principal, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.test(p, id);
  }

  @Post('integrations/:id/go-live')
  @HttpCode(200)
  goLive(@CurrentPrincipal() p: Principal, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.goLive(p, id);
  }

  @Post('integrations/:id/pause')
  @HttpCode(200)
  pause(@CurrentPrincipal() p: Principal, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.pause(p, id);
  }

  @Post('integrations/:id/resume')
  @HttpCode(200)
  resume(@CurrentPrincipal() p: Principal, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.resume(p, id);
  }

  @Post('integrations/:id/rotate-secret')
  @HttpCode(200)
  rotate(@CurrentPrincipal() p: Principal, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.rotateSecret(p, id);
  }

  @Post('integrations/:id/disconnect')
  @HttpCode(200)
  disconnect(@CurrentPrincipal() p: Principal, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.disconnect(p, id);
  }

  @Get('integrations/:id/health')
  health(@CurrentPrincipal() p: Principal, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.health(p, id);
  }

  @Get('integrations/:id/webhook-events')
  events(@CurrentPrincipal() p: Principal, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.webhookEvents(p, id);
  }

  @Post('integrations/:id/reconcile')
  @HttpCode(200)
  async reconcile(@CurrentPrincipal() p: Principal, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReconcileDto) {
    await this.svc.load(p, id);
    return this.recon.runIntegration(id, dto.scopeStart, dto.scopeEnd, p.userId, dto.statement);
  }

  @Get('reconciliations/:id')
  async reconciliation(@CurrentPrincipal() p: Principal, @Param('id', ParseUUIDPipe) id: string) {
    const r = await this.recon.get(id);
    if (r.integrationId) await this.svc.load(p, r.integrationId);
    else if (!p.platformPermissions.has('admin.reconciliation.manage')) throw new ApiError('NOT_FOUND', 'Reconciliation not found');
    return r;
  }

  /** Inbound provider webhooks (spec §20.5, §20.11). Raw body is used for signature verification. */
  @Public()
  @RawResponse()
  @RateLimit({ bucket: 'webhooks', limit: 600, windowSeconds: 60, by: 'ip' })
  @Post('webhooks/:provider')
  async webhook(@Param('provider') provider: string, @Req() req: Request & { rawBody?: Buffer }, @Res() res: Response) {
    const r = await this.webhooks.receive(provider, req.headers, req.rawBody);
    res.status(r.status).json(r.body);
  }

  @RequirePlatformPermission('admin.integrations.manage')
  @Post('admin/webhook-events/:id/replay')
  @HttpCode(200)
  replay(@CurrentPrincipal() p: Principal, @Param('id', ParseUUIDPipe) id: string) {
    return this.webhooks.replay(id, p.userId);
  }

  @RequirePlatformPermission('admin.reconciliation.manage')
  @Post('admin/reconciliations/ledger')
  @HttpCode(200)
  ledgerRecon(@CurrentPrincipal() p: Principal) {
    return this.recon.runLedger(p.userId);
  }

  @RequirePlatformPermission('admin.reconciliation.manage')
  @Post('admin/reconciliation-items/:id/resolve')
  @HttpCode(200)
  resolve(@CurrentPrincipal() p: Principal, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ResolveDto) {
    return this.recon.resolveItem(id, dto.resolution, dto.note, p.userId);
  }
}
