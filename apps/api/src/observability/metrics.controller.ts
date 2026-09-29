import { Controller, Get, Headers, Inject, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Response } from 'express';
import type { Env } from '@codek/config';
import { safeEqual } from '@codek/domain';
import { ENV } from '../config/config.module';
import { Public } from '../auth/decorators';
import { RawResponse } from '../common/envelope.interceptor';
import { ApiError } from '../common/errors';
import { MetricsService } from './metrics.service';

/** Prometheus scrape endpoint. When METRICS_TOKEN is set, a bearer token is required. */
@ApiExcludeController()
@Controller('metrics')
export class MetricsController {
  constructor(
    private readonly metrics: MetricsService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Public()
  @RawResponse()
  @Get()
  async scrape(@Headers('authorization') auth: string | undefined, @Res() res: Response) {
    if (!this.env.METRICS_ENABLED) throw new ApiError('NOT_FOUND', 'Not found');
    const token = process.env.METRICS_TOKEN;
    if (token && !safeEqual(auth ?? '', `Bearer ${token}`)) throw new ApiError('UNAUTHENTICATED', 'Metrics token required');
    const r = await this.metrics.render();
    res.setHeader('Content-Type', r.contentType);
    res.send(r.body);
  }
}
