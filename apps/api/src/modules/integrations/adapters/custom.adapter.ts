import { randomBytes } from 'node:crypto';
import type { IncomingHttpHeaders } from 'node:http';
import { z } from 'zod';
import { hmacSha256, normalizedOrderSchema, safeEqual, NORMALIZED_EVENT_TYPES } from '@codek/domain';
import type { ConnectResult, IntegrationAdapter, NormalizeResult, WebhookVerification } from './adapter.types';

const header = (h: IncomingHttpHeaders, k: string): string | undefined => {
  const v = h[k];
  return Array.isArray(v) ? v[0] : v;
};

/**
 * CODEK standard signed webhook — for custom websites, mobile apps, POS, booking and CRM systems that can send HTTP.
 * Headers: X-Codek-Integration-Id, X-Codek-Event-Id, X-Codek-Timestamp (unix seconds),
 *          X-Codek-Signature: v1=<hex HMAC-SHA256(secret, `${timestamp}.${rawBody}`)>
 * Body: a CODEK normalized order event (docs/INTEGRATIONS.md).
 */
export class CustomWebhookAdapter implements IntegrationAdapter {
  readonly provider = 'custom';
  readonly displayName = 'Custom website / app / POS (signed webhook)';
  readonly category = 'custom' as const;
  readonly authMethods = ['hmac_signed_webhook'];
  readonly configSchema = z.object({ systemType: z.enum(['website', 'mobile_app', 'pos', 'booking', 'crm', 'other']).default('website') }) as unknown as z.ZodType<Record<string, unknown>>;
  readonly credentialsSchema = z.object({}).strict() as unknown as z.ZodType<Record<string, string>>;

  identify(headers: IncomingHttpHeaders) {
    const id = header(headers, 'x-codek-integration-id');
    return id && /^[0-9a-f-]{36}$/i.test(id) ? { integrationId: id } : null;
  }

  async connect(input: { config: Record<string, unknown> }): Promise<ConnectResult> {
    const secret = `whsec_${randomBytes(32).toString('base64url')}`;
    return { externalAccountRef: null, config: input.config, secrets: { signing_secret: secret }, revealOnce: { signingSecret: secret } };
  }

  static sign(secret: string, timestamp: number, rawBody: string | Buffer): string {
    return `v1=${hmacSha256(secret, Buffer.concat([Buffer.from(`${timestamp}.`), Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody)]))}`;
  }

  verifyWebhook(headers: IncomingHttpHeaders, rawBody: Buffer, secrets: Record<string, string>, tolerance: number, now = new Date()): WebhookVerification {
    const ts = Number(header(headers, 'x-codek-timestamp'));
    const sig = header(headers, 'x-codek-signature') ?? '';
    const eventId = header(headers, 'x-codek-event-id') ?? null;
    const secret = secrets.signing_secret;
    const signatureValid = !!secret && Number.isFinite(ts) && safeEqual(CustomWebhookAdapter.sign(secret, ts, rawBody), sig);
    const replayCheckPassed = Number.isFinite(ts) && Math.abs(now.getTime() / 1000 - ts) <= tolerance;
    let eventType = 'unknown';
    try {
      eventType = String((JSON.parse(rawBody.toString('utf8')) as { eventType?: string }).eventType ?? 'unknown');
    } catch {
      eventType = 'malformed';
    }
    return { signatureValid, replayCheckPassed, providerEventId: eventId, eventType, occurredAt: Number.isFinite(ts) ? new Date(ts * 1000) : null };
  }

  normalize(eventType: string, payload: unknown): NormalizeResult {
    if (!(NORMALIZED_EVENT_TYPES as readonly string[]).includes(eventType)) return { ignored: `UNKNOWN_EVENT_TYPE:${eventType}` };
    return { events: [normalizedOrderSchema.parse(payload)] };
  }

  async test(): Promise<{ ok: boolean; detail: string }> {
    return { ok: true, detail: 'Signing secret configured. Send a test event with X-Codek-Test: true to complete the test.' };
  }
}
