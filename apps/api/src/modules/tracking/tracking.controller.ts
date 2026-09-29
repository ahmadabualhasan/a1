import { Body, Controller, Get, HttpCode, Param, Post, Query, Req, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { Public } from '../../auth/decorators';
import { RawResponse } from '../../common/envelope.interceptor';
import { RateLimit } from '../../common/rate-limit';
import { TrackingService, TRACKING_SESSION_COOKIE } from './tracking.service';

class TrackClickDto extends createZodDto(
  z.object({
    referralToken: z.string().regex(/^[a-z0-9]{6,32}$/),
    timestamp: z.iso.datetime({ offset: true }).optional(),
    consentState: z.enum(['granted', 'denied', 'unknown']).default('unknown'),
    landingUrl: z.string().max(2000).optional(),
    source: z.string().max(64).optional(),
  }),
) {}

@ApiTags('tracking')
@Controller()
export class TrackingController {
  constructor(private readonly svc: TrackingService) {}

  /** Short referral redirect: GET /r/:token (outside /api/v1). */
  @Public()
  @RawResponse()
  @RateLimit({ bucket: 'track.redirect', limit: 120, windowSeconds: 60, by: 'ip' })
  @Get('r/:token')
  async redirect(@Param('token') token: string, @Query('src') src: string | undefined, @Req() req: Request, @Res() res: Response) {
    const r = await this.svc.click({
      token,
      method: src === 'qr' ? 'qr' : 'link',
      userAgent: req.header('user-agent') ?? undefined,
      sessionKey: req.cookies?.[TRACKING_SESSION_COOKIE],
      source: src,
    });
    if (r.sessionKey) {
      res.cookie(TRACKING_SESSION_COOKIE, r.sessionKey, { httpOnly: true, sameSite: 'lax', secure: req.secure, maxAge: 30 * 86400000, path: '/r' });
    }
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.redirect(302, r.redirectUrl);
  }

  /** Server/JS SDK click recording. Records a touchpoint only; never creates a commissionable event. */
  @Public()
  @RateLimit({ bucket: 'track.click', limit: 120, windowSeconds: 60, by: 'ip' })
  @Post('track/click')
  @HttpCode(202)
  async click(@Body() dto: TrackClickDto, @Req() req: Request) {
    const r = await this.svc.click({ token: dto.referralToken, method: 'link', userAgent: req.header('user-agent') ?? undefined, consentState: dto.consentState, landingUrl: dto.landingUrl, source: dto.source ?? 'sdk' });
    return { recorded: !!r.clickRef, clickRef: r.clickRef };
  }
}
