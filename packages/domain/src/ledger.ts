import { DomainError, invariant } from './errors';

/**
 * Double-entry ledger model (spec §9). Every financial movement is a balanced journal entry.
 * Balances are always derived from lines; there is no mutable balance field anywhere.
 *
 * Chart of accounts (from CODEK's operational point of view; see docs/architecture/ledger.md):
 *  platform  provider_cash                 asset      funds held at the payment/payout provider
 *  platform  codek_fees_pending            liability  fees accrued on unapproved commissions
 *  platform  codek_fee_revenue             revenue    earned CODEK fees
 *  platform  payout_clearing               liability  payouts requested/in flight at provider
 *  platform  adjustments                   equity     explicit, dual-approved manual corrections
 *  business  merchant_receivable           asset      commission+fee obligations owed by the business, not yet funded
 *  business  merchant_funding              liability  business funding received and not yet allocated
 *  creator   creator_pending               liability  commission accrued, awaiting approval
 *  creator   creator_payable               liability  approved commission, awaiting funding/hold release
 *  creator   creator_available             liability  payout-eligible obligation (NOT custody/escrow, spec §4.6)
 *  creator   creator_clawback_receivable   asset      amounts to recover from a creator after refunds on paid commission
 */
export type LedgerOwnerType = 'platform' | 'business' | 'creator' | 'provider';
export type Direction = 'debit' | 'credit';

export const ACCOUNT_TYPES = {
  provider_cash: { owner: 'platform', normal: 'debit' },
  codek_fees_pending: { owner: 'platform', normal: 'credit' },
  codek_fee_revenue: { owner: 'platform', normal: 'credit' },
  payout_clearing: { owner: 'platform', normal: 'credit' },
  adjustments: { owner: 'platform', normal: 'debit' },
  merchant_receivable: { owner: 'business', normal: 'debit' },
  merchant_funding: { owner: 'business', normal: 'credit' },
  creator_pending: { owner: 'creator', normal: 'credit' },
  creator_payable: { owner: 'creator', normal: 'credit' },
  creator_available: { owner: 'creator', normal: 'credit' },
  creator_clawback_receivable: { owner: 'creator', normal: 'debit' },
} as const satisfies Record<string, { owner: LedgerOwnerType; normal: Direction }>;

export type AccountType = keyof typeof ACCOUNT_TYPES;

export interface AccountRef {
  accountType: AccountType;
  /** business id for business accounts, creator id for creator accounts, null for platform. */
  ownerId: string | null;
  currency: string;
}

export interface PostingLine {
  account: AccountRef;
  direction: Direction;
  amountMinor: bigint;
}

export type EntryType =
  | 'commission_accrued'
  | 'commission_approved'
  | 'commission_funded'
  | 'commission_released'
  | 'commission_reversed'
  | 'commission_clawback'
  | 'clawback_netted'
  | 'funding_received'
  | 'funding_reversed'
  | 'payout_requested'
  | 'payout_paid'
  | 'payout_failed'
  | 'payout_returned'
  | 'manual_adjustment';

export interface Posting {
  entryType: EntryType;
  currency: string;
  lines: PostingLine[];
}

export function ownerTypeOf(accountType: AccountType): LedgerOwnerType {
  return ACCOUNT_TYPES[accountType].owner;
}

/** Enforce double-entry invariants before anything is written. The database re-checks with a deferred trigger. */
export function assertBalanced(posting: Posting): void {
  invariant(posting.lines.length >= 2, 'LEDGER_UNBALANCED', 'A ledger entry needs at least two lines');
  let debit = 0n;
  let credit = 0n;
  for (const line of posting.lines) {
    invariant(line.amountMinor > 0n, 'LEDGER_UNBALANCED', 'Ledger line amounts must be positive');
    invariant(line.account.currency === posting.currency, 'CURRENCY_MISMATCH', 'All ledger lines must share the entry currency');
    const owner = ownerTypeOf(line.account.accountType);
    invariant(
      owner === 'platform' ? line.account.ownerId === null : !!line.account.ownerId,
      'VALIDATION_FAILED',
      'Ledger account owner does not match account type',
      { accountType: line.account.accountType },
    );
    if (line.direction === 'debit') debit += line.amountMinor;
    else credit += line.amountMinor;
  }
  if (debit !== credit) {
    throw new DomainError('LEDGER_UNBALANCED', 'Ledger entry is not balanced', {
      debit: debit.toString(),
      credit: credit.toString(),
    });
  }
}

/** Signed balance in the account's normal direction. */
export function normalBalance(accountType: AccountType, debitsMinor: bigint, creditsMinor: bigint): bigint {
  return ACCOUNT_TYPES[accountType].normal === 'debit' ? debitsMinor - creditsMinor : creditsMinor - debitsMinor;
}

const platform = (accountType: AccountType, currency: string): AccountRef => ({ accountType, ownerId: null, currency });
const biz = (accountType: AccountType, businessId: string, currency: string): AccountRef => ({ accountType, ownerId: businessId, currency });
const cre = (accountType: AccountType, creatorId: string, currency: string): AccountRef => ({ accountType, ownerId: creatorId, currency });

function build(entryType: EntryType, currency: string, lines: Array<PostingLine | null>): Posting {
  const posting: Posting = {
    entryType,
    currency,
    lines: lines.filter((l): l is PostingLine => l !== null && l.amountMinor > 0n),
  };
  assertBalanced(posting);
  return posting;
}

const dr = (account: AccountRef, amountMinor: bigint): PostingLine => ({ account, direction: 'debit', amountMinor });
const cr = (account: AccountRef, amountMinor: bigint): PostingLine => ({ account, direction: 'credit', amountMinor });

export interface CommissionParties {
  businessId: string;
  creatorId: string;
  currency: string;
}

export const Postings = {
  commissionAccrued(p: CommissionParties, commissionMinor: bigint, feeMinor: bigint): Posting {
    return build('commission_accrued', p.currency, [
      dr(biz('merchant_receivable', p.businessId, p.currency), commissionMinor + feeMinor),
      cr(cre('creator_pending', p.creatorId, p.currency), commissionMinor),
      feeMinor > 0n ? cr(platform('codek_fees_pending', p.currency), feeMinor) : null,
    ]);
  },
  commissionApproved(p: CommissionParties, commissionMinor: bigint, feeMinor: bigint): Posting {
    return build('commission_approved', p.currency, [
      dr(cre('creator_pending', p.creatorId, p.currency), commissionMinor),
      cr(cre('creator_payable', p.creatorId, p.currency), commissionMinor),
      feeMinor > 0n ? dr(platform('codek_fees_pending', p.currency), feeMinor) : null,
      feeMinor > 0n ? cr(platform('codek_fee_revenue', p.currency), feeMinor) : null,
    ]);
  },
  commissionFunded(p: CommissionParties, commissionMinor: bigint, feeMinor: bigint): Posting {
    return build('commission_funded', p.currency, [
      dr(biz('merchant_funding', p.businessId, p.currency), commissionMinor + feeMinor),
      cr(biz('merchant_receivable', p.businessId, p.currency), commissionMinor + feeMinor),
    ]);
  },
  commissionReleased(p: CommissionParties, commissionMinor: bigint): Posting {
    return build('commission_released', p.currency, [
      dr(cre('creator_payable', p.creatorId, p.currency), commissionMinor),
      cr(cre('creator_available', p.creatorId, p.currency), commissionMinor),
    ]);
  },
  /**
   * Reverse part/all of an unpaid commission. `stage` is the commission status when the refund was applied.
   * Pre-funding stages credit merchant_receivable (the obligation shrinks); funded stages return funds to merchant_funding.
   */
  commissionReversed(
    p: CommissionParties,
    stage: 'pending' | 'approved' | 'funded' | 'available',
    reversalMinor: bigint,
    feeReversalMinor: bigint,
  ): Posting {
    const creatorAccount: AccountType =
      stage === 'pending' ? 'creator_pending' : stage === 'available' ? 'creator_available' : 'creator_payable';
    const feeAccount: AccountType = stage === 'pending' ? 'codek_fees_pending' : 'codek_fee_revenue';
    const merchantAccount = stage === 'funded' || stage === 'available' ? biz('merchant_funding', p.businessId, p.currency) : biz('merchant_receivable', p.businessId, p.currency);
    return build('commission_reversed', p.currency, [
      dr(cre(creatorAccount, p.creatorId, p.currency), reversalMinor),
      feeReversalMinor > 0n ? dr(platform(feeAccount, p.currency), feeReversalMinor) : null,
      cr(merchantAccount, reversalMinor + feeReversalMinor),
    ]);
  },
  /** Refund after payout (or while a payout is in flight): recover from the creator, credit the merchant. */
  commissionClawback(p: CommissionParties, clawbackMinor: bigint, feeReversalMinor: bigint): Posting {
    return build('commission_clawback', p.currency, [
      dr(cre('creator_clawback_receivable', p.creatorId, p.currency), clawbackMinor),
      feeReversalMinor > 0n ? dr(platform('codek_fee_revenue', p.currency), feeReversalMinor) : null,
      cr(biz('merchant_funding', p.businessId, p.currency), clawbackMinor + feeReversalMinor),
    ]);
  },
  /** Net an outstanding clawback receivable against the creator's available balance. */
  clawbackNetted(creatorId: string, currency: string, amountMinor: bigint): Posting {
    return build('clawback_netted', currency, [
      dr(cre('creator_available', creatorId, currency), amountMinor),
      cr(cre('creator_clawback_receivable', creatorId, currency), amountMinor),
    ]);
  },
  fundingReceived(businessId: string, currency: string, amountMinor: bigint): Posting {
    return build('funding_received', currency, [
      dr(platform('provider_cash', currency), amountMinor),
      cr(biz('merchant_funding', businessId, currency), amountMinor),
    ]);
  },
  fundingReversed(businessId: string, currency: string, amountMinor: bigint): Posting {
    return build('funding_reversed', currency, [
      dr(biz('merchant_funding', businessId, currency), amountMinor),
      cr(platform('provider_cash', currency), amountMinor),
    ]);
  },
  payoutRequested(creatorId: string, currency: string, amountMinor: bigint): Posting {
    return build('payout_requested', currency, [
      dr(cre('creator_available', creatorId, currency), amountMinor),
      cr(platform('payout_clearing', currency), amountMinor),
    ]);
  },
  payoutPaid(currency: string, amountMinor: bigint): Posting {
    return build('payout_paid', currency, [
      dr(platform('payout_clearing', currency), amountMinor),
      cr(platform('provider_cash', currency), amountMinor),
    ]);
  },
  payoutFailed(creatorId: string, currency: string, amountMinor: bigint): Posting {
    return build('payout_failed', currency, [
      dr(platform('payout_clearing', currency), amountMinor),
      cr(cre('creator_available', creatorId, currency), amountMinor),
    ]);
  },
  /** Provider returned a completed payout (e.g. invalid recipient after settlement). */
  payoutReturned(creatorId: string, currency: string, amountMinor: bigint): Posting {
    return build('payout_returned', currency, [
      dr(platform('provider_cash', currency), amountMinor),
      cr(cre('creator_available', creatorId, currency), amountMinor),
    ]);
  },
  /** Explicit manual adjustment against the adjustments account; requires dual approval upstream. */
  manualAdjustment(target: AccountRef, direction: Direction, amountMinor: bigint): Posting {
    const counter = platform('adjustments', target.currency);
    return build('manual_adjustment', target.currency, [
      { account: target, direction, amountMinor },
      { account: counter, direction: direction === 'debit' ? 'credit' : 'debit', amountMinor },
    ]);
  },
};
