import { describe, expect, it } from 'vitest';
import { decideAttribution, type AttributionPolicy, type Touchpoint } from './attribution';

const T0 = new Date('2026-09-01T12:00:00Z');
const minutesBefore = (m: number) => new Date(T0.getTime() - m * 60_000);
const policy = (model: AttributionPolicy['model']): AttributionPolicy => ({ policyId: 'p', version: '3', model, windowSeconds: 7 * 86400 });
const tp = (id: string, method: Touchpoint['method'], partnership: string, at: Date, eligible = true): Touchpoint => ({
  id,
  method,
  partnershipId: partnership,
  creatorId: `c-${partnership}`,
  campaignId: 'camp',
  occurredAt: at,
  eligible,
});

describe('attribution decisions', () => {
  it('unattributed when no touchpoints', () => {
    const d = decideAttribution({ policy: policy('code_first'), conversionOccurredAt: T0, touchpoints: [] });
    expect(d.decisionState).toBe('unattributed');
    expect(d.policyVersion).toBe('3');
  });

  it('single code attribution', () => {
    const d = decideAttribution({ policy: policy('code_first'), conversionOccurredAt: T0, touchpoints: [tp('1', 'code', 'A', T0)] });
    expect(d).toMatchObject({ decisionState: 'attributed', selectedPartnershipId: 'A', method: 'code', conflictState: 'none' });
  });

  it('spec example: link from A, code from B → code_first picks B and records conflict', () => {
    const tps = [tp('1', 'link', 'A', minutesBefore(30)), tp('2', 'code', 'B', T0)];
    const d = decideAttribution({ policy: policy('code_first'), conversionOccurredAt: T0, touchpoints: tps });
    expect(d).toMatchObject({ decisionState: 'attributed', selectedPartnershipId: 'B', conflictState: 'conflict', reason: 'CODE_PRECEDENCE' });
    expect(d.competingTouchpoints).toHaveLength(2);
  });

  it('link_first picks the link partnership', () => {
    const tps = [tp('1', 'link', 'A', minutesBefore(30)), tp('2', 'code', 'B', T0)];
    const d = decideAttribution({ policy: policy('link_first'), conversionOccurredAt: T0, touchpoints: tps });
    expect(d.selectedPartnershipId).toBe('A');
  });

  it('last_touch and first_touch', () => {
    const tps = [tp('1', 'link', 'A', minutesBefore(60)), tp('2', 'qr', 'B', minutesBefore(10))];
    expect(decideAttribution({ policy: policy('last_touch'), conversionOccurredAt: T0, touchpoints: tps }).selectedPartnershipId).toBe('B');
    expect(decideAttribution({ policy: policy('first_touch'), conversionOccurredAt: T0, touchpoints: tps }).selectedPartnershipId).toBe('A');
  });

  it('two different codes cannot be resolved → conflicted, never double-credited', () => {
    const tps = [tp('1', 'code', 'A', T0), tp('2', 'code', 'B', T0)];
    const d = decideAttribution({ policy: policy('code_first'), conversionOccurredAt: T0, touchpoints: tps });
    expect(d).toMatchObject({ decisionState: 'conflicted', conflictState: 'unresolved', selectedPartnershipId: null });
  });

  it('exact tie across partnerships is unresolved', () => {
    const at = minutesBefore(5);
    const d = decideAttribution({ policy: policy('last_touch'), conversionOccurredAt: T0, touchpoints: [tp('1', 'link', 'A', at), tp('2', 'link', 'B', at)] });
    expect(d.decisionState).toBe('conflicted');
  });

  it('touchpoints outside the window or ineligible are recorded but not used', () => {
    const tps = [tp('1', 'link', 'A', minutesBefore(8 * 24 * 60)), tp('2', 'code', 'B', T0, false)];
    const d = decideAttribution({ policy: policy('code_first'), conversionOccurredAt: T0, touchpoints: tps });
    expect(d.decisionState).toBe('invalid');
    expect(d.competingTouchpoints.map((c) => c.reason)).toEqual(['OUTSIDE_WINDOW', 'INELIGIBLE']);
  });

  it('touchpoints after the conversion (beyond skew) are ignored', () => {
    const later = new Date(T0.getTime() + 3600_000);
    const d = decideAttribution({ policy: policy('last_touch'), conversionOccurredAt: T0, touchpoints: [tp('1', 'link', 'A', later)] });
    expect(d.decisionState).toBe('invalid');
  });

  it('duplicates are never attributed', () => {
    const d = decideAttribution({ policy: policy('code_first'), conversionOccurredAt: T0, touchpoints: [tp('1', 'code', 'A', T0)], dedupeState: 'duplicate' });
    expect(d.decisionState).toBe('duplicate');
    expect(d.selectedPartnershipId).toBeNull();
  });

  it('is independent of input order (deterministic)', () => {
    const tps = [tp('1', 'link', 'A', minutesBefore(50)), tp('2', 'link', 'B', minutesBefore(40)), tp('3', 'qr', 'C', minutesBefore(45))];
    const a = decideAttribution({ policy: policy('last_touch'), conversionOccurredAt: T0, touchpoints: tps });
    const b = decideAttribution({ policy: policy('last_touch'), conversionOccurredAt: T0, touchpoints: [...tps].reverse() });
    expect(a).toEqual(b);
  });
});
