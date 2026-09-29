import type { NextFunction, Request, Response } from 'express';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF defence for cookie-authenticated requests (spec §13.4, OWASP): state-changing requests that carry a session
 * cookie must come from an allowlisted Origin (or Referer). SameSite=Lax cookies are the first layer; this is the second.
 * Server-to-server endpoints (webhooks, tracking) do not use cookies and are exempt by construction.
 */
export function csrfMiddleware(allowedOrigins: string[], cookiePrefix: string) {
  const allowed = new Set(allowedOrigins.map((o) => o.replace(/\/$/, '')));
  return (req: Request, res: Response, next: NextFunction): void => {
    if (SAFE_METHODS.has(req.method)) return next();
    const cookieHeader = req.headers.cookie ?? '';
    const hasSessionCookie = cookieHeader.includes(`${cookiePrefix}.session_token`) || cookieHeader.includes(`__Secure-${cookiePrefix}.session_token`);
    if (!hasSessionCookie) return next();
    const origin = req.header('origin') ?? originOf(req.header('referer'));
    if (origin && allowed.has(origin)) return next();
    res.status(403).json({
      error: { code: 'CSRF_REJECTED', message: 'Request origin is not allowed', details: {}, requestId: res.getHeader('X-Request-Id') ?? null },
    });
  };
}

function originOf(referer?: string): string | undefined {
  if (!referer) return undefined;
  try {
    return new URL(referer).origin;
  } catch {
    return undefined;
  }
}
