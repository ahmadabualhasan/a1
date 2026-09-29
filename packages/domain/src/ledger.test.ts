import { describe, expect, it } from 'vitest';
import { assertBalanced, normalBalance, Postings, type Posting } from './ledger';

const p = { businessId: 'b1', creatorId: 'c1', currency: 'USD' };

function net(postings: Posting[]): Map<string, bigint> {
  const m = new Map<string, bigint>();
  for (const posting of postings) {
    for (const l of posting.lines) {
      const k = `${l.account.accountType}:${l.account.ownerId ?? 'platform'}`;
      const signed = l.direction === 'debit' ? l.amountMinor : -l.amountMinor;
      m.set(k, (m.get(k) ?? 0n) + signed);
    }
  }
  return m;
}

describe('ledger postings', () => {
  it('every template balances', () => {
    const all = [
      Postings.commissionAccrued(p, 900n, 90n),
      Postings.commissionApproved(p, 900n, 90n),
      Postings.commissionFunded(p, 900n, 90n),
      Postings.commissionReleased(p, 900n),
      Postings.commissionReversed(p, 'pending', 100n, 10n),
      Postings.commissionReversed(p, 'funded', 100n, 0n),
      Postings.commissionClawback(p, 100n, 10n),
      Postings.clawbackNetted('c1', 'USD', 50n),
      Postings.fundingReceived('b1', 'USD', 5000n),
      Postings.payoutRequested('c1', 'USD', 900n),
      Postings.payoutPaid('USD', 900n),
      Postings.payoutFailed('c1', 'USD', 900n),
      Postings.manualAdjustment({ accountType: 'creator_available', ownerId: 'c1', currency: 'USD' }, 'credit', 10n),
    ];
    for (const posting of all) expect(() => assertBalanced(posting)).not.toThrow();
  });

  it('rejects unbalanced, empty, zero and mixed-currency entries', () => {
    const acc = { accountType: 'provider_cash' as const, ownerId: null, currency: 'USD' };
    expect(() => assertBalanced({ entryType: 'manual_adjustment', currency: 'USD', lines: [{ account: acc, direction: 'debit', amountMinor: 1n }] })).toThrow();
    expect(() =>
      assertBalanced({
        entryType: 'manual_adjustment',
        currency: 'USD',
        lines: [
          { account: acc, direction: 'debit', amountMinor: 2n },
          { account: { ...acc, accountType: 'adjustments' }, direction: 'credit', amountMinor: 1n },
        ],
      }),
    ).toThrow(/not balanced/);
    expect(() =>
      assertBalanced({
        entryType: 'manual_adjustment',
        currency: 'USD',
        lines: [
          { account: acc, direction: 'debit', amountMinor: 0n },
          { account: { ...acc, accountType: 'adjustments' }, direction: 'credit', amountMinor: 0n },
        ],
      }),
    ).toThrow(/positive/);
    expect(() =>
      assertBalanced({
        entryType: 'manual_adjustment',
        currency: 'USD',
        lines: [
          { account: acc, direction: 'debit', amountMinor: 1n },
          { account: { ...acc, accountType: 'adjustments', currency: 'JOD' }, direction: 'credit', amountMinor: 1n },
        ],
      }),
    ).toThrow();
  });

  it('full lifecycle: accrue → approve → fund → release → payout → paid leaves only cash movement', () => {
    const flow = [
      Postings.fundingReceived('b1', 'USD', 990n),
      Postings.commissionAccrued(p, 900n, 90n),
      Postings.commissionApproved(p, 900n, 90n),
      Postings.commissionFunded(p, 900n, 90n),
      Postings.commissionReleased(p, 900n),
      Postings.payoutRequested('c1', 'USD', 900n),
      Postings.payoutPaid('USD', 900n),
    ];
    const n = net(flow);
    expect(n.get('creator_pending:c1')).toBe(0n);
    expect(n.get('creator_payable:c1')).toBe(0n);
    expect(n.get('creator_available:c1')).toBe(0n);
    expect(n.get('merchant_receivable:b1')).toBe(0n);
    expect(n.get('merchant_funding:b1')).toBe(0n);
    expect(n.get('payout_clearing:platform')).toBe(0n);
    // cash in 990, cash out 900 → 90 fee revenue retained
    expect(n.get('provider_cash:platform')).toBe(90n);
    expect(-(n.get('codek_fee_revenue:platform') ?? 0n)).toBe(90n);
    const total = [...n.values()].reduce((s, v) => s + v, 0n);
    expect(total).toBe(0n);
  });

  it('refund before approval restores the merchant obligation', () => {
    const flow = [Postings.commissionAccrued(p, 900n, 0n), Postings.commissionReversed(p, 'pending', 900n, 0n)];
    const n = net(flow);
    expect(n.get('merchant_receivable:b1')).toBe(0n);
    expect(n.get('creator_pending:c1')).toBe(0n);
  });

  it('normal balance direction', () => {
    expect(normalBalance('creator_available', 100n, 300n)).toBe(200n);
    expect(normalBalance('provider_cash', 300n, 100n)).toBe(200n);
  });
});
