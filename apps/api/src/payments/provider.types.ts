/**
 * Payment/payout provider abstraction (spec §10.2). The ledger never depends on a provider; adapters translate.
 */
export interface PayoutRecipient {
  type: 'paypal' | 'bank' | 'other';
  email?: string;
  accountRef?: string;
}

export interface PayoutRequest {
  payoutId: string;
  attemptNumber: number;
  amountMinor: bigint;
  currency: string;
  recipient: PayoutRecipient;
  idempotencyKey: string;
  note?: string;
}

export type ProviderOutcome =
  | { status: 'success'; providerReference: string; raw?: string }
  | { status: 'processing'; providerReference: string; raw?: string }
  | { status: 'failed'; providerReference?: string; errorCode: string; errorMessageSafe: string; retryable: boolean; raw?: string };

export interface PayoutProvider {
  readonly name: string;
  readonly environment: 'test' | 'live';
  /** Whether this adapter is fully configured (credentials present). */
  readonly configured: boolean;
  createPayout(req: PayoutRequest): Promise<ProviderOutcome>;
  getPayoutStatus(providerReference: string): Promise<ProviderOutcome>;
}

export interface FundingIntentRequest {
  fundingId: string;
  businessId: string;
  amountMinor: bigint;
  currency: string;
  method: string;
  idempotencyKey: string;
}

export type FundingOutcome =
  | { status: 'confirmed'; providerTransactionId: string }
  | { status: 'pending'; providerTransactionId?: string; instructions: string }
  | { status: 'failed'; errorCode: string; errorMessageSafe: string };

export interface FundingProvider {
  readonly name: string;
  readonly environment: 'test' | 'live';
  readonly methods: string[];
  createFunding(req: FundingIntentRequest): Promise<FundingOutcome>;
}
