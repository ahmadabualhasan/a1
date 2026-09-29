import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { ZodValidationException } from 'nestjs-zod';
import { ZodError } from 'zod';
import { DomainError } from '@codek/domain';
import { ApiError, ERROR_STATUS, type ApiErrorCode } from './errors';
import { currentContext } from './request-context';

interface ErrorBody {
  code: ApiErrorCode;
  message: string;
  details: Record<string, unknown>;
  status: number;
}

/** Maps every error to the standard envelope `{ error: { code, message, details, requestId } }` without leaking internals. */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('HttpExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    const body = this.toBody(exception);
    const requestId = currentContext()?.requestId ?? null;
    if (body.status >= 500) {
      if (process.env.CODEK_TEST_LOG) console.error('DEBUG500', exception);
      const err = exception as Error;
      this.logger.error({ err: { name: err?.name, message: err?.message, stack: err?.stack }, requestId }, 'Unhandled error');
    }
    if (res.headersSent) return;
    res.status(body.status).json({ error: { code: body.code, message: body.message, details: body.details, requestId } });
  }

  private toBody(e: unknown): ErrorBody {
    if (e instanceof ApiError) return { code: e.code, message: e.message, details: e.details, status: e.status };
    if (e instanceof DomainError) {
      const code = (e.code in ERROR_STATUS ? e.code : 'BUSINESS_RULE_VIOLATION') as ApiErrorCode;
      const status = code === 'LEDGER_UNBALANCED' ? 500 : ERROR_STATUS[code];
      return { code, message: status >= 500 ? 'Internal error' : e.message, details: status >= 500 ? {} : e.details, status };
    }
    if (e instanceof ZodValidationException) {
      const zerr = e.getZodError() as ZodError;
      return { code: 'VALIDATION_FAILED', message: 'Request validation failed', details: { issues: formatIssues(zerr) }, status: 400 };
    }
    if (e instanceof ZodError) {
      return { code: 'VALIDATION_FAILED', message: 'Request validation failed', details: { issues: formatIssues(e) }, status: 400 };
    }
    if (e instanceof HttpException) {
      const status = e.getStatus();
      const code: ApiErrorCode =
        status === 404 ? 'NOT_FOUND' : status === 401 ? 'UNAUTHENTICATED' : status === 403 ? 'FORBIDDEN' : status === 413 ? 'PAYLOAD_TOO_LARGE' : status === 429 ? 'RATE_LIMITED' : status < 500 ? 'BAD_REQUEST' : 'INTERNAL_ERROR';
      const message = status < 500 ? safeMessage(e) : 'Internal error';
      return { code, message, details: {}, status };
    }
    const pe = e as { code?: string; message?: string };
    if (pe?.code === 'P2002') return { code: 'CONFLICT', message: 'A record with these values already exists', details: {}, status: 409 };
    if (pe?.code === 'P2025') return { code: 'NOT_FOUND', message: 'Resource not found', details: {}, status: 404 };
    if (typeof pe?.message === 'string' && /CODEK_(IMMUTABLE|NO_DELETE)/.test(pe.message)) {
      return { code: 'CONFLICT', message: 'This record is part of the permanent history and cannot be changed', details: {}, status: 409 };
    }
    if (typeof (e as { type?: string })?.type === 'string' && (e as { type: string }).type === 'entity.too.large') {
      return { code: 'PAYLOAD_TOO_LARGE', message: 'Request body too large', details: {}, status: HttpStatus.PAYLOAD_TOO_LARGE };
    }
    if (typeof (e as { type?: string })?.type === 'string' && (e as { type: string }).type === 'entity.parse.failed') {
      return { code: 'BAD_REQUEST', message: 'Malformed JSON body', details: {}, status: 400 };
    }
    return { code: 'INTERNAL_ERROR', message: 'Internal error', details: {}, status: 500 };
  }
}

function formatIssues(err: ZodError): Array<{ path: string; message: string; code: string }> {
  return err.issues.map((i) => ({ path: i.path.join('.'), message: i.message, code: i.code }));
}

function safeMessage(e: HttpException): string {
  const r = e.getResponse();
  if (typeof r === 'string') return r;
  const m = (r as { message?: unknown }).message;
  if (typeof m === 'string') return m;
  if (Array.isArray(m)) return m.join('; ');
  return e.message;
}
