import { CallHandler, ExecutionContext, Injectable, NestInterceptor, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { map, type Observable } from 'rxjs';
import { toJsonSafe } from './json';
import { currentContext } from './request-context';

export const RAW_RESPONSE = 'codek:raw-response';
/** Skip the `{ data, meta }` envelope (redirects, files, webhook acks with provider-specific bodies). */
export const RawResponse = (): MethodDecorator => SetMetadata(RAW_RESPONSE, true);

export interface Paginated<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export function isPaginated(v: unknown): v is Paginated<unknown> {
  return !!v && typeof v === 'object' && Array.isArray((v as Paginated<unknown>).items) && typeof (v as Paginated<unknown>).total === 'number';
}

/** Standard success envelope: `{ data, meta: { requestId, pagination? } }` (spec §20 addendum). */
@Injectable()
export class EnvelopeInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const raw = this.reflector.getAllAndOverride<boolean>(RAW_RESPONSE, [ctx.getHandler(), ctx.getClass()]);
    if (raw) return next.handle();
    return next.handle().pipe(
      map((value) => {
        const requestId = currentContext()?.requestId ?? null;
        if (isPaginated(value)) {
          return {
            data: toJsonSafe(value.items),
            meta: { requestId, pagination: { total: value.total, limit: value.limit, offset: value.offset } },
          };
        }
        return { data: toJsonSafe(value ?? null), meta: { requestId } };
      }),
    );
  }
}
