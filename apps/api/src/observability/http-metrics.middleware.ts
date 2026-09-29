import type { NextFunction, Request, Response } from 'express';
import type { MetricsService } from './metrics.service';

/** Records latency per route template (ids collapsed) and counts 5xx responses. */
export function httpMetricsMiddleware(metrics: MetricsService) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const end = metrics.httpDuration.startTimer();
    res.on('finish', () => {
      const route = (req.baseUrl + (req.route?.path ?? req.path)).replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, ':id').replace(/\/r\/[a-z0-9]+/, '/r/:token').slice(0, 120);
      end({ method: req.method, route, status: String(res.statusCode) });
      if (res.statusCode >= 500) metrics.httpErrors.inc({ route });
    });
    next();
  };
}
