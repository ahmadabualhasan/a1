import { Controller, Get, Param, ParseUUIDPipe, Query, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { CurrentPrincipal, RequirePlatformPermission } from '../../auth/decorators';
import type { Principal } from '../../auth/principal';
import { RawResponse } from '../../common/envelope.interceptor';
import { ApiError } from '../../common/errors';
import { RateLimit } from '../../common/rate-limit';
import { isoDate } from '../../common/validation';
import { AnalyticsService, type Range } from './analytics.service';

class RangeDto extends createZodDto(z.object({ from: isoDate.optional(), to: isoDate.optional() })) {}
class ExportDto extends createZodDto(z.object({ from: isoDate.optional(), to: isoDate.optional(), kind: z.enum(['conversions', 'creators']).default('conversions') })) {}

function range(q: { from?: Date; to?: Date }): Range {
  const to = q.to ?? new Date();
  const from = q.from ?? new Date(to.getTime() - 30 * 86400000);
  if (from >= to) throw new ApiError('VALIDATION_FAILED', '"from" must be before "to"');
  if (to.getTime() - from.getTime() > 366 * 86400000) throw new ApiError('VALIDATION_FAILED', 'The range can be at most one year');
  return { from, to };
}

@ApiTags('analytics')
@Controller()
export class AnalyticsController {
  constructor(private readonly svc: AnalyticsService) {}

  @Get('businesses/:businessId/analytics/overview')
  overview(@CurrentPrincipal() p: Principal, @Param('businessId', ParseUUIDPipe) businessId: string, @Query() q: RangeDto) {
    return this.svc.businessOverview(p, businessId, range(q));
  }

  @Get('businesses/:businessId/analytics/creators')
  creators(@CurrentPrincipal() p: Principal, @Param('businessId', ParseUUIDPipe) businessId: string, @Query() q: RangeDto) {
    return this.svc.creatorTable(p, businessId, range(q));
  }

  @Get('businesses/:businessId/analytics/campaigns')
  campaigns(@CurrentPrincipal() p: Principal, @Param('businessId', ParseUUIDPipe) businessId: string, @Query() q: RangeDto) {
    return this.svc.campaignTable(p, businessId, range(q));
  }

  @Get('businesses/:businessId/analytics/timeseries')
  timeseries(@CurrentPrincipal() p: Principal, @Param('businessId', ParseUUIDPipe) businessId: string, @Query() q: RangeDto) {
    return this.svc.timeseries(p, businessId, range(q));
  }

  @RawResponse()
  @RateLimit({ bucket: 'analytics.export', limit: 20, windowSeconds: 3600 })
  @Get('businesses/:businessId/analytics/export.csv')
  async export(@CurrentPrincipal() p: Principal, @Param('businessId', ParseUUIDPipe) businessId: string, @Query() q: ExportDto, @Res() res: Response) {
    const csv = await this.svc.exportCsv(p, businessId, q.kind, range(q));
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="codek-${q.kind}-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.send('\uFEFF' + csv); // UTF-8 BOM so Excel detects the encoding
  }

  @Get('creator/analytics')
  creator(@CurrentPrincipal() p: Principal, @Query() q: RangeDto) {
    return this.svc.creatorAnalytics(p, range(q));
  }

  @RequirePlatformPermission('admin.finance.read')
  @Get('admin/analytics')
  platform(@Query() q: RangeDto) {
    return this.svc.platform(range(q));
  }
}
