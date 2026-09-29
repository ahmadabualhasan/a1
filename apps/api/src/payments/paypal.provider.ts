import type { SafeHttpClient } from '../common/safe-http';
import { formatMinor } from '@codek/domain';
import type { PayoutProvider, PayoutRequest, ProviderOutcome } from './provider.types';

interface PayPalBatchResponse {
  batch_header?: { payout_batch_id?: string; batch_status?: string };
  items?: Array<{ transaction_status?: string; errors?: { name?: string; message?: string } }>;
  name?: string;
  message?: string;
}

/**
 * PayPal Payouts adapter (CREDENTIAL_REQUIRED). Implements create (sender_batch_id = idempotency key) and status poll.
 * Availability for the launch market and the legal structure must be confirmed before live use (spec §10.7, D-020).
 */
export class PayPalPayoutProvider implements PayoutProvider {
  readonly name = 'paypal';
  readonly configured: boolean;
  private token?: { value: string; expiresAt: number };

  constructor(
    private readonly http: SafeHttpClient,
    private readonly cfg: { environment: 'sandbox' | 'live'; clientId?: string; clientSecret?: string },
  ) {
    this.configured = !!cfg.clientId && !!cfg.clientSecret;
  }

  get environment(): 'test' | 'live' {
    return this.cfg.environment === 'live' ? 'live' : 'test';
  }

  private get base(): string {
    return this.cfg.environment === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
  }

  private async accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now() + 60_000) return this.token.value;
    const basic = Buffer.from(`${this.cfg.clientId}:${this.cfg.clientSecret}`).toString('base64');
    const r = await this.http.fetchJson<{ access_token?: string; expires_in?: number }>(`${this.base}/v1/oauth2/token`, {
      method: 'POST',
      headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=client_credentials',
    });
    if (r.status !== 200 || !r.body?.access_token) throw new Error('PAYPAL_AUTH_FAILED');
    this.token = { value: r.body.access_token, expiresAt: Date.now() + (r.body.expires_in ?? 300) * 1000 };
    return this.token.value;
  }

  async createPayout(req: PayoutRequest): Promise<ProviderOutcome> {
    if (!this.configured) return { status: 'failed', errorCode: 'PROVIDER_NOT_CONFIGURED', errorMessageSafe: 'Payout provider is not configured', retryable: false };
    if (req.recipient.type !== 'paypal' || !req.recipient.email) return { status: 'failed', errorCode: 'UNSUPPORTED_RECIPIENT', errorMessageSafe: 'A PayPal email is required', retryable: false };
    try {
      const token = await this.accessToken();
      const r = await this.http.fetchJson<PayPalBatchResponse>(`${this.base}/v1/payments/payouts`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'PayPal-Request-Id': req.idempotencyKey },
        body: JSON.stringify({
          sender_batch_header: { sender_batch_id: req.idempotencyKey, email_subject: 'Your CODEK payout', email_message: req.note ?? 'CODEK creator payout' },
          items: [{ recipient_type: 'EMAIL', receiver: req.recipient.email, sender_item_id: req.payoutId, amount: { value: formatMinor(req.amountMinor, req.currency), currency: req.currency } }],
        }),
      });
      const batchId = r.body?.batch_header?.payout_batch_id;
      if ((r.status === 201 || r.status === 200) && batchId) return { status: 'processing', providerReference: batchId };
      const retryable = r.status >= 500 || r.status === 429;
      return { status: 'failed', errorCode: r.body?.name ?? `HTTP_${r.status}`, errorMessageSafe: 'The payout provider rejected the request', retryable };
    } catch (e) {
      return { status: 'failed', errorCode: (e as Error).message === 'PAYPAL_AUTH_FAILED' ? 'PROVIDER_AUTH_FAILED' : 'PROVIDER_UNREACHABLE', errorMessageSafe: 'Could not reach the payout provider', retryable: true };
    }
  }

  async getPayoutStatus(providerReference: string): Promise<ProviderOutcome> {
    if (!this.configured) return { status: 'failed', errorCode: 'PROVIDER_NOT_CONFIGURED', errorMessageSafe: 'Payout provider is not configured', retryable: false };
    const token = await this.accessToken();
    const r = await this.http.fetchJson<PayPalBatchResponse>(`${this.base}/v1/payments/payouts/${encodeURIComponent(providerReference)}`, { headers: { Authorization: `Bearer ${token}` } });
    const item = r.body?.items?.[0];
    const s = item?.transaction_status ?? r.body?.batch_header?.batch_status;
    if (s === 'SUCCESS') return { status: 'success', providerReference };
    if (s === 'FAILED' || s === 'RETURNED' || s === 'BLOCKED' || s === 'DENIED') return { status: 'failed', providerReference, errorCode: s, errorMessageSafe: item?.errors?.message ? 'The payout was not completed by the provider' : 'Payout failed', retryable: false };
    return { status: 'processing', providerReference };
  }
}
