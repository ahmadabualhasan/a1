import { createHash } from 'node:crypto';
import type { FundingIntentRequest, FundingOutcome, FundingProvider, PayoutProvider, PayoutRequest, ProviderOutcome } from './provider.types';

/**
 * TEST-ONLY sandbox provider. Deterministic outcomes for automated tests and local development:
 *  - recipient email containing "fail"      → non-retryable failure (RECIPIENT_REJECTED)
 *  - recipient email containing "flaky"     → retryable failure on attempt 1, success afterwards
 *  - recipient email containing "async"     → processing; status poll returns success
 *  - otherwise                               → immediate success
 * Refused in production by configuration validation (PAYOUT_PROVIDER=sandbox not allowed).
 */
export class SandboxPayoutProvider implements PayoutProvider {
  readonly name = 'sandbox';
  readonly environment = 'test' as const;
  readonly configured = true;

  async createPayout(req: PayoutRequest): Promise<ProviderOutcome> {
    const ref = `sbx_po_${createHash('sha256').update(req.idempotencyKey).digest('hex').slice(0, 20)}`;
    const email = req.recipient.email ?? '';
    if (email.includes('fail')) return { status: 'failed', providerReference: ref, errorCode: 'RECIPIENT_REJECTED', errorMessageSafe: 'The payout account rejected the transfer', retryable: false };
    if (email.includes('flaky') && req.attemptNumber === 1) return { status: 'failed', providerReference: ref, errorCode: 'PROVIDER_TIMEOUT', errorMessageSafe: 'Temporary provider error', retryable: true };
    if (email.includes('async')) return { status: 'processing', providerReference: ref };
    return { status: 'success', providerReference: ref };
  }

  async getPayoutStatus(providerReference: string): Promise<ProviderOutcome> {
    return { status: 'success', providerReference };
  }
}

export class SandboxFundingProvider implements FundingProvider {
  readonly name = 'sandbox';
  readonly environment = 'test' as const;
  readonly methods = ['sandbox'];

  async createFunding(req: FundingIntentRequest): Promise<FundingOutcome> {
    return { status: 'confirmed', providerTransactionId: `sbx_fd_${createHash('sha256').update(req.idempotencyKey).digest('hex').slice(0, 20)}` };
  }
}
