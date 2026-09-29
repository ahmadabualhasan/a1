import { describe, expect, it } from 'vitest';
import { assertValidCode, generateCodeCandidate, normalizeCode, isValidCode } from './codes';
import { assertTransition, CampaignMachine, canTransition, CommissionMachine, ApplicationMachine, PayoutMachine } from './state-machines';
import { assertAllowedDestination, hostMatches, isPrivateAddress, safeRelativePath } from './url-safety';
import { stableStringify, pseudonymize } from './hashing';
import { ROLE_DEFINITIONS, roleHasPermission } from './permissions';
import { normalizedOrderSchema } from './events';

describe('codes', () => {
  it('normalizes case-insensitively and strips whitespace', () => {
    expect(normalizeCode('  sara-10 ')).toBe('SARA-10');
    expect(normalizeCode('ｓａｒａ１０')).toBe('SARA10'); // full-width NFKC
    expect(normalizeCode('Sa ra10')).toBe('SARA10');
  });
  it('validates format', () => {
    expect(isValidCode('AB')).toBe(false);
    expect(isValidCode('-ABC')).toBe(false);
    expect(() => assertValidCode('ok$code')).toThrow();
    expect(assertValidCode('summer_25')).toBe('SUMMER_25');
  });
  it('generates valid candidates', () => {
    for (let i = 0; i < 200; i++) expect(isValidCode(generateCodeCandidate('Sara Beauty!'))).toBe(true);
    expect(generateCodeCandidate('x')).toMatch(/^CDK-/);
  });
});

describe('state machines', () => {
  it('campaign lifecycle follows spec order', () => {
    expect(canTransition(CampaignMachine, 'draft', 'pending_review')).toBe(true);
    expect(canTransition(CampaignMachine, 'draft', 'active')).toBe(false);
    expect(() => assertTransition(CampaignMachine, 'archived', 'draft')).toThrow(/Cannot change campaign/);
  });
  it('waitlist never auto-converts to a partnership state', () => {
    expect(ApplicationMachine.transitions.waitlisted).not.toContain('pending');
    expect(canTransition(ApplicationMachine, 'waitlisted', 'accepted')).toBe(true);
  });
  it('commission lifecycle', () => {
    const path = ['pending', 'approved', 'funded', 'available', 'payout_requested', 'processing', 'paid'] as const;
    for (let i = 0; i < path.length - 1; i++) expect(canTransition(CommissionMachine, path[i]!, path[i + 1]!)).toBe(true);
    expect(canTransition(CommissionMachine, 'paid', 'reversed')).toBe(false);
    expect(canTransition(CommissionMachine, 'paid', 'clawback')).toBe(true);
  });
  it('failed payouts keep history and can be retried', () => {
    expect(canTransition(PayoutMachine, 'failed', 'processing')).toBe(true);
    expect(PayoutMachine.terminal).toContain('cancelled');
  });
});

describe('url safety', () => {
  it('host matching resists suffix tricks', () => {
    expect(hostMatches('shop.example.com', 'example.com')).toBe(true);
    expect(hostMatches('example.com', 'example.com')).toBe(true);
    expect(hostMatches('evilexample.com', 'example.com')).toBe(false);
    expect(hostMatches('example.com.evil.io', 'example.com')).toBe(false);
  });
  it('destination allowlist', () => {
    expect(assertAllowedDestination('https://shop.example.com/p?x=1', ['example.com']).hostname).toBe('shop.example.com');
    expect(() => assertAllowedDestination('https://evil.io', ['example.com'])).toThrow(/not allowed/);
    expect(() => assertAllowedDestination('javascript:alert(1)', ['example.com'])).toThrow();
    expect(() => assertAllowedDestination('http://example.com', ['example.com'])).toThrow(/https/);
    expect(() => assertAllowedDestination('https://u:p@example.com', ['example.com'])).toThrow(/credentials/);
  });
  it('private address detection (SSRF)', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.1.1', '169.254.169.254', '::1', 'fd00::1', '::ffff:127.0.0.1', '0.0.0.0', '100.64.0.1']) {
      expect(isPrivateAddress(ip)).toBe(true);
    }
    expect(isPrivateAddress('8.8.8.8')).toBe(false);
    expect(isPrivateAddress('2606:4700::1111')).toBe(false);
  });
  it('safe relative redirects', () => {
    expect(safeRelativePath('/dashboard')).toBe('/dashboard');
    expect(safeRelativePath('//evil.com')).toBe('/');
    expect(safeRelativePath('/\\evil.com')).toBe('/');
    expect(safeRelativePath('https://evil.com')).toBe('/');
  });
});

describe('hashing', () => {
  it('stable stringify sorts keys and handles bigint', () => {
    expect(stableStringify({ b: 1n, a: [2, { d: 1, c: null }] })).toBe('{"a":[2,{"c":null,"d":1}],"b":"1"}');
  });
  it('pseudonymize is keyed', () => {
    expect(pseudonymize('1.2.3.4', 'pepper-a-long-one')).not.toBe(pseudonymize('1.2.3.4', 'pepper-b-long-one'));
  });
});

describe('permissions', () => {
  it('business viewer cannot manage campaigns; owner can; creators cannot admin', () => {
    expect(roleHasPermission('business_viewer', 'campaign.manage')).toBe(false);
    expect(roleHasPermission('business_owner', 'campaign.manage')).toBe(true);
    expect(roleHasPermission('creator', 'admin.access')).toBe(false);
    expect(roleHasPermission('support_agent', 'admin.finance.approve')).toBe(false);
    expect(ROLE_DEFINITIONS.find((r) => r.name === 'business_owner')!.permissions.some((p) => p.startsWith('admin.'))).toBe(false);
  });
});

describe('normalized events', () => {
  it('parses money as bigint and rejects negatives', () => {
    const e = normalizedOrderSchema.parse({ eventType: 'ORDER_PAID', externalEventId: 'e1', externalRef: 'o1', occurredAt: '2026-01-01T00:00:00Z', grossMinor: '1000' });
    expect(e.grossMinor).toBe(1000n);
    expect(() => normalizedOrderSchema.parse({ eventType: 'ORDER_PAID', externalEventId: 'e1', externalRef: 'o1', occurredAt: '2026-01-01', grossMinor: -5 })).toThrow();
    expect(() => normalizedOrderSchema.parse({ eventType: 'NOPE', externalEventId: 'e1', externalRef: 'o1', occurredAt: '2026-01-01' })).toThrow();
  });
});
