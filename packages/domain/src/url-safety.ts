import { isIP } from 'node:net';
import { DomainError } from './errors';

/**
 * URL safety helpers (spec §7.3, §13.4): referral destinations must be https (http only in dev),
 * host-allowlisted, never credentials-bearing, and server-side fetches must not reach private networks.
 */
export function parseHttpUrl(raw: string, opts: { allowHttp?: boolean } = {}): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new DomainError('UNSAFE_URL', 'Invalid URL');
  }
  const okProtocol = url.protocol === 'https:' || (opts.allowHttp && url.protocol === 'http:');
  if (!okProtocol) throw new DomainError('UNSAFE_URL', 'Only https URLs are allowed');
  if (url.username || url.password) throw new DomainError('UNSAFE_URL', 'URLs must not contain credentials');
  if (!url.hostname) throw new DomainError('UNSAFE_URL', 'URL must have a host');
  return url;
}

/** True when `host` equals `allowed` or is a subdomain of it. Case-insensitive, no suffix tricks. */
export function hostMatches(host: string, allowed: string): boolean {
  const h = host.toLowerCase().replace(/\.$/, '');
  const a = allowed.toLowerCase().replace(/\.$/, '').replace(/^\*\./, '');
  return h === a || h.endsWith(`.${a}`);
}

export function assertAllowedDestination(raw: string, allowedHosts: string[], opts: { allowHttp?: boolean } = {}): URL {
  const url = parseHttpUrl(raw, opts);
  if (!allowedHosts.some((a) => hostMatches(url.hostname, a))) {
    throw new DomainError('UNSAFE_URL', 'Destination host is not allowed for this campaign', { host: url.hostname });
  }
  return url;
}

/** Returns true for loopback, private, link-local, CGNAT, multicast, unspecified and metadata addresses. */
export function isPrivateAddress(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const [a, b] = ip.split('.').map(Number) as [number, number, number, number];
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  if (v === 6) {
    const x = ip.toLowerCase();
    if (x === '::' || x === '::1') return true;
    if (x.startsWith('fe8') || x.startsWith('fe9') || x.startsWith('fea') || x.startsWith('feb')) return true;
    if (x.startsWith('fc') || x.startsWith('fd') || x.startsWith('ff')) return true;
    const mapped = x.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateAddress(mapped[1]!);
    return false;
  }
  return true;
}

/** Validate a safe relative in-app redirect path (prevents open redirects like //evil.com or /\evil.com). */
export function safeRelativePath(raw: string | null | undefined, fallback = '/'): string {
  if (!raw || typeof raw !== 'string') return fallback;
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\') || /[\r\n]/.test(raw)) return fallback;
  return raw;
}
