import createClient, { type Middleware } from 'openapi-fetch';
import type { paths } from './schema';

export type { paths } from './schema';

/** Standard error envelope returned by the CODEK API. */
export interface ApiErrorBody {
  code: string;
  message: string;
  details: Record<string, unknown>;
  requestId: string | null;
}

export class CodekApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: ApiErrorBody,
  ) {
    super(body.message);
    this.name = 'CodekApiError';
  }
  get code(): string {
    return this.body.code;
  }
  /** Field-level validation issues (path → message) for forms. */
  get fieldErrors(): Record<string, string> {
    const issues = (this.body.details?.issues as Array<{ path: string; message: string }> | undefined) ?? [];
    return Object.fromEntries(issues.map((i) => [i.path, i.message]));
  }
}

export interface Envelope<T> {
  data: T;
  meta: { requestId: string | null; pagination?: { total: number; limit: number; offset: number } };
}

/** Typed client (paths/params/bodies from OpenAPI). Cookies are sent automatically (same-origin proxy). */
export function createCodekClient(baseUrl = '', opts: { idempotencyKey?: () => string } = {}) {
  const client = createClient<paths>({ baseUrl, credentials: 'include' });
  const mw: Middleware = {
    onRequest({ request }) {
      if (request.method === 'POST' && opts.idempotencyKey && !request.headers.has('Idempotency-Key')) request.headers.set('Idempotency-Key', opts.idempotencyKey());
      return request;
    },
  };
  client.use(mw);
  return client;
}

/**
 * Minimal fetch helper used by the web app: unwraps `{ data, meta }`, throws CodekApiError with the machine-readable
 * error envelope. Money values are integer minor units; never compute financial amounts client-side.
 */
export async function api<T>(path: string, init: RequestInit & { json?: unknown; idempotencyKey?: string } = {}): Promise<Envelope<T>> {
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  let body = init.body;
  if (init.json !== undefined) {
    headers.set('Content-Type', 'application/json');
    body = JSON.stringify(init.json);
  }
  if (init.idempotencyKey) headers.set('Idempotency-Key', init.idempotencyKey);
  const res = await fetch(path.startsWith('/api/') ? path : `/api/v1${path}`, { ...init, headers, body, credentials: 'include' });
  const text = await res.text();
  const parsed = text ? (JSON.parse(text) as Envelope<T> | { error: ApiErrorBody }) : null;
  if (!res.ok || (parsed && 'error' in parsed)) {
    const err = parsed && 'error' in parsed ? parsed.error : { code: 'HTTP_' + res.status, message: 'Something went wrong. Please try again.', details: {}, requestId: null };
    throw new CodekApiError(res.status, err);
  }
  return parsed as Envelope<T>;
}

const EXPONENTS: Record<string, number> = { JOD: 3, KWD: 3, BHD: 3, OMR: 3, TND: 3, IQD: 3, LYD: 3, JPY: 0, KRW: 0 };

/** Display-only formatting of integer minor units (no arithmetic on money in the browser). */
export function formatMoney(minor: number | string | null | undefined, currency: string | null | undefined, locale = 'en'): string {
  if (minor == null || !currency) return '—';
  const exp = EXPONENTS[currency] ?? 2;
  const s = String(minor);
  const neg = s.startsWith('-');
  const digits = (neg ? s.slice(1) : s).padStart(exp + 1, '0');
  const major = digits.slice(0, digits.length - exp) || '0';
  const frac = exp ? digits.slice(digits.length - exp) : '';
  const grouped = Number(major).toLocaleString(locale);
  return `${neg ? '-' : ''}${grouped}${exp ? `.${frac}` : ''} ${currency}`;
}

/** Converts a user-entered major amount ("12.500") into minor units string for request payloads (no floats). */
export function toMinorUnits(input: string, currency: string): number | null {
  const exp = EXPONENTS[currency] ?? 2;
  const m = input.trim().match(/^(\d+)(?:\.(\d+))?$/);
  if (!m) return null;
  const frac = m[2] ?? '';
  if (frac.length > exp) return null;
  const v = Number(m[1]) * 10 ** exp + Number(frac.padEnd(exp, '0') || '0');
  return Number.isSafeInteger(v) ? v : null;
}

export function formatRate(rate: string | null | undefined): string {
  if (rate == null) return '—';
  const [i, f = ''] = rate.split('.');
  const scaled = `${i}${f.padEnd(6, '0')}`.replace(/^0+(?=\d)/, '');
  const pct = (Number(scaled) / 10_000).toString();
  return `${pct}%`;
}
