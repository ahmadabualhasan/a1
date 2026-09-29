import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { pseudonymize } from '@codek/domain';
import { requestContext } from './request-context';

const ID_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/;

/** Assigns X-Request-Id / X-Correlation-Id and runs the request inside an AsyncLocalStorage context. */
export function requestIdMiddleware(pepper: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const incoming = req.header('x-request-id');
    const requestId = incoming && ID_PATTERN.test(incoming) ? incoming : randomUUID();
    const incomingCorrelation = req.header('x-correlation-id');
    const correlationId = incomingCorrelation && ID_PATTERN.test(incomingCorrelation) ? incomingCorrelation : requestId;
    res.setHeader('X-Request-Id', requestId);
    res.setHeader('X-Correlation-Id', correlationId);
    (req as Request & { id?: string }).id = requestId;
    const ip = req.ip ?? '';
    const ua = req.header('user-agent') ?? '';
    requestContext.run(
      { requestId, correlationId, ipHash: ip ? pseudonymize(ip, pepper) : undefined, userAgentHash: ua ? pseudonymize(ua, pepper) : undefined },
      () => next(),
    );
  };
}
