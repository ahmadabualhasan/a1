import { z } from 'zod';

/**
 * Normalized CODEK event contracts (spec §11.5, §21). Provider-specific payloads stay inside adapters;
 * domain consumers only see these versioned schemas.
 */
export const NORMALIZED_EVENT_TYPES = [
  'ORDER_CREATED',
  'ORDER_PAID',
  'ORDER_COMPLETED',
  'ORDER_CANCELLED',
  'ORDER_REFUNDED',
  'BOOKING_CREATED',
  'BOOKING_COMPLETED',
  'REDEMPTION_CREATED',
] as const;
export type NormalizedEventType = (typeof NORMALIZED_EVENT_TYPES)[number];

export const NORMALIZED_SCHEMA_VERSION = '1.0';

const minor = z.union([z.number().int(), z.string().regex(/^-?\d+$/)]).transform((v) => BigInt(v));
const minorNonNeg = minor.refine((v) => v >= 0n, 'must be >= 0');

export const lineItemSchema = z.object({
  sku: z.string().max(200).nullish(),
  productId: z.string().max(200).nullish(),
  category: z.string().max(200).nullish(),
  quantity: z.number().int().positive().default(1),
  grossMinor: minorNonNeg,
  discountMinor: minorNonNeg.nullish(),
});

export const normalizedOrderSchema = z.object({
  eventType: z.enum(NORMALIZED_EVENT_TYPES),
  schemaVersion: z.literal(NORMALIZED_SCHEMA_VERSION).default(NORMALIZED_SCHEMA_VERSION),
  externalEventId: z.string().min(1).max(255),
  /** Order/booking/redemption reference in the merchant system (dedupe key within business+source). */
  externalRef: z.string().min(1).max(255),
  occurredAt: z.coerce.date(),
  currency: z.string().regex(/^[A-Z]{3}$/).optional(),
  grossMinor: minorNonNeg.optional(),
  discountMinor: minorNonNeg.optional(),
  taxMinor: minorNonNeg.optional(),
  shippingMinor: minorNonNeg.optional(),
  otherFeeMinor: minorNonNeg.optional(),
  netMinor: minorNonNeg.optional(),
  totalMinor: minorNonNeg.optional(),
  /** Cumulative refunded amount for ORDER_REFUNDED events (customer-total basis). */
  refundedTotalMinor: minorNonNeg.optional(),
  discountCodes: z.array(z.string().max(64)).max(20).default([]),
  /** CODEK referral click id (propagated as `codek_ref` from the redirect). */
  referralClickId: z.string().max(64).nullish(),
  referralToken: z.string().max(64).nullish(),
  /** Pseudonymous customer reference; raw PII must not be sent. Hashed again server-side. */
  customerRef: z.string().max(255).nullish(),
  lineItems: z.array(lineItemSchema).max(500).optional(),
  conversionType: z.enum(['sale', 'booking', 'redemption', 'lead', 'registration', 'other']).optional(),
});
export type NormalizedOrderEvent = z.infer<typeof normalizedOrderSchema>;

export const INTERNAL_EVENT_TYPES = [
  'ConversionRecorded',
  'AttributionResolved',
  'CommissionCalculated',
  'CommissionApproved',
  'CommissionReversed',
  'FundingReceived',
  'PayoutRequested',
  'PayoutProcessed',
  'PayoutFailed',
  'DisputeOpened',
  'FraudFlagged',
  'PartnershipCreated',
  'ApplicationSubmitted',
  'ApplicationDecided',
  'InvitationSent',
  'DeliverableSubmitted',
  'DeliverableReviewed',
  'MessageSent',
] as const;
export type InternalEventType = (typeof INTERNAL_EVENT_TYPES)[number];

export interface EventEnvelope<T = unknown> {
  eventId: string;
  eventType: string;
  schemaVersion: string;
  occurredAt: string;
  receivedAt: string;
  source: string;
  businessId: string | null;
  correlationId: string | null;
  idempotencyKey: string | null;
  payload: T;
}

export function eventMapsToConversionType(t: NormalizedEventType): 'sale' | 'booking' | 'redemption' {
  if (t.startsWith('BOOKING')) return 'booking';
  if (t === 'REDEMPTION_CREATED') return 'redemption';
  return 'sale';
}
