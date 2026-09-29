import type { IncomingHttpHeaders } from 'node:http';
import type { z } from 'zod';
import type { NormalizedOrderEvent } from '@codek/domain';

export interface WebhookVerification {
  signatureValid: boolean;
  /** Timestamp within tolerance (or provider gives no timestamp and signature covers the event id). */
  replayCheckPassed: boolean;
  providerEventId: string | null;
  eventType: string;
  occurredAt: Date | null;
}

export interface ExternalOrderSummary {
  externalRef: string;
  occurredAt: Date;
  currency: string;
  grossMinor: bigint;
  discountCodes: string[];
  referralClickId?: string | null;
  cancelled?: boolean;
  refundedTotalMinor?: bigint;
}

export type NormalizeResult = { events: NormalizedOrderEvent[] } | { ignored: string };

export interface ConnectResult {
  externalAccountRef: string | null;
  config: Record<string, unknown>;
  /** Secrets to persist in the secret store (credential type → value). */
  secrets: Record<string, string>;
  /** Shown to the business once (e.g. a generated signing secret). Never stored in plaintext elsewhere. */
  revealOnce?: Record<string, string>;
}

/**
 * Integration adapter contract (spec §11): provider-specific code stays here; the core only sees normalized events.
 */
export interface IntegrationAdapter {
  readonly provider: string;
  readonly displayName: string;
  readonly category: 'ecommerce' | 'pos' | 'booking' | 'payment' | 'crm' | 'custom' | 'other';
  readonly authMethods: string[];
  readonly configSchema: z.ZodType<Record<string, unknown>>;
  readonly credentialsSchema: z.ZodType<Record<string, string>>;
  /** Locate the integration an inbound webhook belongs to (integration id or external account ref). */
  identify(headers: IncomingHttpHeaders): { integrationId?: string; externalAccountRef?: string } | null;
  connect(input: { config: Record<string, unknown>; credentials: Record<string, string> }): Promise<ConnectResult>;
  verifyWebhook(headers: IncomingHttpHeaders, rawBody: Buffer, secrets: Record<string, string>, toleranceSeconds: number, now?: Date): WebhookVerification;
  normalize(eventType: string, payload: unknown): NormalizeResult;
  /** Connection test (may call the provider through the SSRF-safe client). */
  test(config: Record<string, unknown>, secrets: Record<string, string>): Promise<{ ok: boolean; detail: string }>;
  /** Optional pull of orders for reconciliation. */
  fetchOrders?(config: Record<string, unknown>, secrets: Record<string, string>, from: Date, to: Date): Promise<ExternalOrderSummary[]>;
}
