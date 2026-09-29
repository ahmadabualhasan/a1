import type { IncomingHttpHeaders } from 'node:http';
import { z } from 'zod';
import { hmacSha256, parseMajorToMinor, safeEqual, type NormalizedOrderEvent } from '@codek/domain';
import type { SafeHttpClient } from '../../../common/safe-http';
import type { ConnectResult, ExternalOrderSummary, IntegrationAdapter, NormalizeResult, WebhookVerification } from './adapter.types';

const API_VERSION = '2025-07';
const header = (h: IncomingHttpHeaders, k: string): string | undefined => {
  const v = h[k];
  return Array.isArray(v) ? v[0] : v;
};

interface ShopifyMoneyLine {
  price?: string;
  quantity?: number;
  sku?: string | null;
  product_id?: number | null;
  total_discount?: string;
  product_type?: string | null;
}
interface ShopifyOrder {
  id: number;
  name?: string;
  created_at: string;
  updated_at?: string;
  processed_at?: string;
  cancelled_at?: string | null;
  currency: string;
  financial_status?: string;
  total_line_items_price?: string;
  subtotal_price?: string;
  total_discounts?: string;
  total_tax?: string;
  total_price?: string;
  shipping_lines?: Array<{ price?: string }>;
  discount_codes?: Array<{ code: string }>;
  note_attributes?: Array<{ name: string; value: string }>;
  landing_site?: string | null;
  customer?: { id?: number } | null;
  line_items?: ShopifyMoneyLine[];
  refunds?: Array<{ transactions?: Array<{ amount?: string; kind?: string; status?: string }> }>;
}

const TOPIC_MAP: Record<string, NormalizedOrderEvent['eventType']> = {
  'orders/create': 'ORDER_CREATED',
  'orders/paid': 'ORDER_PAID',
  'orders/fulfilled': 'ORDER_COMPLETED',
  'orders/cancelled': 'ORDER_CANCELLED',
  'orders/updated': 'ORDER_REFUNDED',
};

/**
 * Shopify adapter (CREDENTIAL_REQUIRED for live use). Webhook HMAC: base64 HMAC-SHA256 of the raw body with the app
 * secret (X-Shopify-Hmac-Sha256). Event id: X-Shopify-Webhook-Id. Refunds are read from orders/updated as cumulative
 * refunded totals so out-of-order delivery is safe.
 */
export class ShopifyAdapter implements IntegrationAdapter {
  readonly provider = 'shopify';
  readonly displayName = 'Shopify';
  readonly category = 'ecommerce' as const;
  readonly authMethods = ['hmac_signed_webhook', 'access_token'];
  readonly configSchema = z.object({ shopDomain: z.string().regex(/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/, 'Use your-store.myshopify.com') }) as unknown as z.ZodType<Record<string, unknown>>;
  readonly credentialsSchema = z.object({ webhookSecret: z.string().min(16).max(256), adminApiToken: z.string().min(10).max(256).optional() }) as unknown as z.ZodType<Record<string, string>>;

  constructor(private readonly http: SafeHttpClient) {}

  identify(headers: IncomingHttpHeaders) {
    const shop = header(headers, 'x-shopify-shop-domain');
    return shop ? { externalAccountRef: shop.toLowerCase() } : null;
  }

  async connect(input: { config: Record<string, unknown>; credentials: Record<string, string> }): Promise<ConnectResult> {
    const secrets: Record<string, string> = { webhook_secret: input.credentials.webhookSecret! };
    if (input.credentials.adminApiToken) secrets.admin_api_token = input.credentials.adminApiToken;
    return { externalAccountRef: String(input.config.shopDomain).toLowerCase(), config: input.config, secrets };
  }

  verifyWebhook(headers: IncomingHttpHeaders, rawBody: Buffer, secrets: Record<string, string>, tolerance: number, now = new Date()): WebhookVerification {
    const sig = header(headers, 'x-shopify-hmac-sha256') ?? '';
    const secret = secrets.webhook_secret;
    const signatureValid = !!secret && safeEqual(hmacSha256(secret, rawBody, 'base64'), sig);
    const triggered = header(headers, 'x-shopify-triggered-at');
    const at = triggered ? new Date(triggered) : null;
    const replayCheckPassed = at ? Math.abs(now.getTime() - at.getTime()) / 1000 <= tolerance : true;
    return { signatureValid, replayCheckPassed, providerEventId: header(headers, 'x-shopify-webhook-id') ?? null, eventType: header(headers, 'x-shopify-topic') ?? 'unknown', occurredAt: at };
  }

  normalize(topic: string, payload: unknown): NormalizeResult {
    const type = TOPIC_MAP[topic];
    if (!type) return { ignored: `UNSUPPORTED_TOPIC:${topic}` };
    const o = payload as ShopifyOrder;
    if (!o || typeof o.id !== 'number' || !o.currency) throw new Error('MALFORMED_SHOPIFY_ORDER');
    const cur = o.currency.toUpperCase();
    const m = (v?: string | null) => (v ? parseMajorToMinor(v, cur) : 0n);
    const refundedTotal = (o.refunds ?? []).flatMap((r) => r.transactions ?? []).filter((t) => t.kind === 'refund' && t.status !== 'failure').reduce((s, t) => s + m(t.amount), 0n);
    if (topic === 'orders/updated' && refundedTotal === 0n) return { ignored: 'ORDER_UPDATED_WITHOUT_REFUND' };
    const codekRef = o.note_attributes?.find((a) => a.name === 'codek_ref')?.value ?? refFromLanding(o.landing_site);
    const base = {
      eventType: type,
      schemaVersion: '1.0' as const,
      externalEventId: `${topic}:${o.id}:${type === 'ORDER_REFUNDED' ? refundedTotal.toString() : (o.updated_at ?? o.created_at)}`,
      externalRef: String(o.id),
      occurredAt: new Date(type === 'ORDER_CREATED' ? o.created_at : (o.updated_at ?? o.processed_at ?? o.created_at)),
      currency: cur,
      grossMinor: m(o.total_line_items_price),
      discountMinor: m(o.total_discounts),
      taxMinor: m(o.total_tax),
      shippingMinor: (o.shipping_lines ?? []).reduce((s, l) => s + m(l.price), 0n),
      otherFeeMinor: 0n,
      totalMinor: m(o.total_price),
      discountCodes: (o.discount_codes ?? []).map((d) => d.code).slice(0, 20),
      referralClickId: codekRef ?? null,
      customerRef: o.customer?.id ? `shopify-customer:${o.customer.id}` : null,
      conversionType: 'sale' as const,
      lineItems: (o.line_items ?? []).map((li) => ({
        sku: li.sku ?? null,
        productId: li.product_id != null ? String(li.product_id) : null,
        category: li.product_type ?? null,
        quantity: li.quantity ?? 1,
        grossMinor: m(li.price) * BigInt(li.quantity ?? 1),
        discountMinor: m(li.total_discount),
      })),
      ...(type === 'ORDER_REFUNDED' ? { refundedTotalMinor: refundedTotal } : {}),
    };
    // Order creation happens before discounts are final in rare cases; the created event is the conversion's origin.
    if (base.discountMinor > base.grossMinor) base.discountMinor = base.grossMinor;
    return { events: [base as unknown as NormalizedOrderEvent] };
  }

  async test(config: Record<string, unknown>, secrets: Record<string, string>): Promise<{ ok: boolean; detail: string }> {
    if (!secrets.admin_api_token) return { ok: true, detail: 'Webhook secret stored. Add an Admin API token to enable connection checks and reconciliation.' };
    try {
      const r = await this.http.fetchJson<{ shop?: { myshopify_domain?: string } }>(`https://${config.shopDomain}/admin/api/${API_VERSION}/shop.json`, { headers: { 'X-Shopify-Access-Token': secrets.admin_api_token } });
      return r.status === 200 ? { ok: true, detail: 'Connected to Shopify store' } : { ok: false, detail: `Shopify responded with HTTP ${r.status}` };
    } catch {
      return { ok: false, detail: 'Could not reach Shopify' };
    }
  }

  async fetchOrders(config: Record<string, unknown>, secrets: Record<string, string>, from: Date, to: Date): Promise<ExternalOrderSummary[]> {
    if (!secrets.admin_api_token) throw new Error('RECONCILIATION_REQUIRES_ADMIN_TOKEN');
    const url = `https://${config.shopDomain}/admin/api/${API_VERSION}/orders.json?status=any&limit=250&created_at_min=${from.toISOString()}&created_at_max=${to.toISOString()}`;
    const r = await this.http.fetchJson<{ orders?: ShopifyOrder[] }>(url, { headers: { 'X-Shopify-Access-Token': secrets.admin_api_token } });
    if (r.status !== 200) throw new Error(`SHOPIFY_HTTP_${r.status}`);
    return (r.body?.orders ?? []).map((o) => {
      const cur = o.currency.toUpperCase();
      return {
        externalRef: String(o.id),
        occurredAt: new Date(o.created_at),
        currency: cur,
        grossMinor: parseMajorToMinor(o.total_line_items_price ?? '0', cur),
        discountCodes: (o.discount_codes ?? []).map((d) => d.code),
        referralClickId: o.note_attributes?.find((a) => a.name === 'codek_ref')?.value ?? null,
        cancelled: !!o.cancelled_at,
      };
    });
  }
}

function refFromLanding(landing?: string | null): string | null {
  if (!landing) return null;
  try {
    return new URL(landing, 'https://placeholder.invalid').searchParams.get('codek_ref');
  } catch {
    return null;
  }
}
