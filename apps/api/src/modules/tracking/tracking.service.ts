import { randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { PrismaClient } from '@codek/database';
import { hostMatches, parseHttpUrl, pseudonymize } from '@codek/domain';
import type { Env } from '@codek/config';
import { ENV } from '../../config/config.module';
import { PRISMA } from '../../prisma/prisma.service';
import { currentContext } from '../../common/request-context';

const BOT_UA = /(bot|crawler|spider|preview|facebookexternalhit|slurp|headless|curl|wget|python-requests)/i;
export const TRACKING_SESSION_COOKIE = 'codek_ts';
const SESSION_TTL_DAYS = 30;

export interface ClickInput {
  token: string;
  method: 'link' | 'qr';
  userAgent?: string;
  sessionKey?: string;
  consentState?: string;
  landingUrl?: string;
  source?: string;
}

/**
 * Referral tracking (spec §6.2 layer A). Clicks are evidence only — they never create commission.
 * Redirects only ever go to the partnership's stored destination whose host was allowlisted at creation
 * (no open redirect, no URL proxying, spec §7.3).
 */
@Injectable()
export class TrackingService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(ENV) private readonly env: Env,
  ) {}

  fallbackUrl(): string {
    return `${this.env.WEB_PUBLIC_URL.replace(/\/$/, '')}/link-unavailable`;
  }

  /** Returns the redirect URL and optional new session key. */
  async click(input: ClickInput): Promise<{ redirectUrl: string; clickRef: string | null; sessionKey: string | null }> {
    if (!/^[a-z0-9]{6,32}$/.test(input.token)) return { redirectUrl: this.fallbackUrl(), clickRef: null, sessionKey: null };
    const link = await this.prisma.referralLink.findUnique({ where: { token: input.token }, include: { partnership: { include: { campaign: { select: { id: true, status: true } } } } } });
    if (!link) return { redirectUrl: this.fallbackUrl(), clickRef: null, sessionKey: null };
    const destination = this.safeDestination(link.destinationUrl, link.allowedHost);
    if (!destination) return { redirectUrl: this.fallbackUrl(), clickRef: null, sessionKey: null };
    const trackable = link.status === 'active' && link.partnership.status === 'active' && link.partnership.campaign.status === 'active';
    if (!trackable) return { redirectUrl: destination.toString(), clickRef: null, sessionKey: null };

    const ctx = currentContext();
    const pepper = this.env.HASH_PEPPER;
    const sessionKey = input.sessionKey && /^[A-Za-z0-9_-]{16,64}$/.test(input.sessionKey) ? input.sessionKey : randomBytes(18).toString('base64url');
    const sessionKeyHash = pseudonymize(sessionKey, pepper);
    const now = new Date();
    const ps = link.partnership;
    const session = await this.prisma.trackingSession.upsert({
      where: { businessId_sessionKeyHash: { businessId: ps.businessId, sessionKeyHash } },
      update: { lastTouchAt: now, partnershipId: ps.id, creatorId: ps.creatorId, campaignId: ps.campaignId, expiresAt: new Date(now.getTime() + SESSION_TTL_DAYS * 86400000), consentState: input.consentState },
      create: { businessId: ps.businessId, campaignId: ps.campaignId, partnershipId: ps.id, creatorId: ps.creatorId, sessionKeyHash, firstTouchAt: now, lastTouchAt: now, expiresAt: new Date(now.getTime() + SESSION_TTL_DAYS * 86400000), consentState: input.consentState },
    });
    const clickRef = `ck_${randomBytes(12).toString('base64url')}`;
    await this.prisma.trackingClick.create({
      data: {
        businessId: ps.businessId,
        campaignId: ps.campaignId,
        partnershipId: ps.id,
        creatorId: ps.creatorId,
        referralLinkId: link.id,
        trackingSessionId: session.id,
        clickRef,
        method: input.method,
        occurredAt: now,
        sessionKeyHash,
        source: input.source?.slice(0, 64),
        landingUrl: input.landingUrl ? stripQuery(input.landingUrl) : null,
        userAgentHash: ctx?.userAgentHash ?? (input.userAgent ? pseudonymize(input.userAgent, pepper) : null),
        ipHash: ctx?.ipHash ?? null,
        consentState: input.consentState,
        suspected: !!input.userAgent && BOT_UA.test(input.userAgent),
      },
    });
    destination.searchParams.set('codek_ref', clickRef);
    return { redirectUrl: destination.toString(), clickRef, sessionKey };
  }

  /** Re-validate the stored destination at redirect time (defence in depth). */
  private safeDestination(url: string, allowedHost: string): URL | null {
    try {
      const u = parseHttpUrl(url, { allowHttp: this.env.APP_ENV === 'development' || this.env.APP_ENV === 'test' });
      return hostMatches(u.hostname, allowedHost) ? u : null;
    } catch {
      return null;
    }
  }
}

function stripQuery(u: string): string | null {
  try {
    const x = new URL(u);
    return `${x.origin}${x.pathname}`.slice(0, 500);
  } catch {
    return null;
  }
}
