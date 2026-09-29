import { lookup } from 'node:dns/promises';
import { hostMatches, isPrivateAddress } from '@codek/domain';
import { parseList } from '@codek/config';
import { ApiError } from './errors';

export interface SafeFetchOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
  maxResponseBytes?: number;
}

/**
 * Outbound HTTP for provider adapters (spec §13.4 SSRF): https only, host must match the configured egress allowlist,
 * every resolved address must be public, redirects are not followed, bounded time and response size.
 */
export class SafeHttpClient {
  private readonly allow: string[];
  constructor(allowlistCsv: string) {
    this.allow = parseList(allowlistCsv);
  }

  async assertAllowed(url: URL): Promise<void> {
    if (url.protocol !== 'https:') throw new ApiError('UNSAFE_URL', 'Outbound requests must use https');
    if (url.username || url.password) throw new ApiError('UNSAFE_URL', 'Credentials in URL are not allowed');
    if (!this.allow.some((a) => hostMatches(url.hostname, a))) throw new ApiError('UNSAFE_URL', 'Destination host is not in the egress allowlist', { host: url.hostname });
    const addrs = await lookup(url.hostname, { all: true, verbatim: true }).catch(() => []);
    if (!addrs.length) throw new ApiError('PROVIDER_ERROR', 'Could not resolve provider host');
    if (addrs.some((a) => isPrivateAddress(a.address))) throw new ApiError('UNSAFE_URL', 'Destination resolves to a private address');
  }

  async fetchJson<T>(rawUrl: string, opts: SafeFetchOptions = {}): Promise<{ status: number; body: T | null }> {
    const url = new URL(rawUrl);
    await this.assertAllowed(url);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 15_000);
    try {
      const res = await fetch(url, { method: opts.method ?? 'GET', headers: opts.headers, body: opts.body, redirect: 'manual', signal: ctrl.signal });
      const max = opts.maxResponseBytes ?? 1_000_000;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > max) throw new ApiError('PROVIDER_ERROR', 'Provider response too large');
      const text = buf.toString('utf8');
      let body: T | null = null;
      try {
        body = text ? (JSON.parse(text) as T) : null;
      } catch {
        body = null;
      }
      return { status: res.status, body };
    } finally {
      clearTimeout(timer);
    }
  }
}
