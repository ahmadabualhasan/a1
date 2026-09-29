/**
 * Deterministic, versioned attribution decision engine (spec §6).
 * Touchpoints are evidence; the decision is made once per conversion under the policy version
 * frozen in the partnership/campaign snapshot. The engine never double-credits (no split policy in V1).
 */
export type AttributionMethod = 'code' | 'link' | 'qr' | 'other';
export type AttributionModel = 'code_first' | 'link_first' | 'last_touch' | 'first_touch';
export type DecisionState = 'attributed' | 'unattributed' | 'conflicted' | 'invalid' | 'duplicate';
export type ConflictState = 'none' | 'conflict' | 'unresolved';
export type DedupeState = 'unique' | 'duplicate' | 'suspect';

export interface AttributionPolicy {
  policyId: string;
  version: string;
  model: AttributionModel;
  /** Lookback window for link/QR touchpoints, in seconds. */
  windowSeconds: number;
  /** Allowed clock skew for touchpoints recorded slightly after the conversion timestamp. */
  clockSkewSeconds?: number;
}

export interface Touchpoint {
  id: string;
  method: AttributionMethod;
  partnershipId: string | null;
  creatorId: string | null;
  campaignId: string | null;
  occurredAt: Date;
  /** False when the asset/partnership was not active at the conversion time. */
  eligible: boolean;
  ineligibleReason?: string | null;
}

export interface CompetingTouchpoint {
  touchpointId: string;
  method: AttributionMethod;
  partnershipId: string | null;
  creatorId: string | null;
  occurredAt: string;
  considered: boolean;
  reason: string | null;
}

export interface AttributionDecision {
  decisionState: DecisionState;
  conflictState: ConflictState;
  dedupeState: DedupeState;
  selectedPartnershipId: string | null;
  selectedCreatorId: string | null;
  selectedTouchpointId: string | null;
  method: AttributionMethod | 'none';
  policyId: string;
  policyVersion: string;
  model: AttributionModel;
  windowSeconds: number;
  competingTouchpoints: CompetingTouchpoint[];
  reason: string;
}

export const DEFAULT_ATTRIBUTION_POLICY: AttributionPolicy = {
  policyId: 'codek-default',
  version: '1',
  model: 'code_first',
  windowSeconds: 30 * 24 * 60 * 60,
  clockSkewSeconds: 300,
};

const isLinkLike = (m: AttributionMethod) => m === 'link' || m === 'qr';

function byTimeThenId(a: Touchpoint, b: Touchpoint): number {
  const d = a.occurredAt.getTime() - b.occurredAt.getTime();
  return d !== 0 ? d : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function distinctPartnerships(tps: Touchpoint[]): string[] {
  return [...new Set(tps.map((t) => t.partnershipId).filter((p): p is string => !!p))];
}

/**
 * Pick one touchpoint from a set by recency (last) or primacy (first).
 * Returns null when the extreme timestamp is shared by different partnerships (unresolvable tie).
 */
function pickExtreme(tps: Touchpoint[], which: 'first' | 'last'): Touchpoint | null {
  if (tps.length === 0) return null;
  const sorted = [...tps].sort(byTimeThenId);
  const target = which === 'last' ? sorted[sorted.length - 1]! : sorted[0]!;
  const ties = sorted.filter((t) => t.occurredAt.getTime() === target.occurredAt.getTime());
  if (distinctPartnerships(ties).length > 1) return null;
  return target;
}

export function decideAttribution(input: {
  policy: AttributionPolicy;
  conversionOccurredAt: Date;
  touchpoints: Touchpoint[];
  dedupeState?: DedupeState;
}): AttributionDecision {
  const { policy, conversionOccurredAt } = input;
  const dedupeState = input.dedupeState ?? 'unique';
  const skewMs = (policy.clockSkewSeconds ?? 300) * 1000;
  const windowStart = conversionOccurredAt.getTime() - policy.windowSeconds * 1000;
  const windowEnd = conversionOccurredAt.getTime() + skewMs;

  const competing: CompetingTouchpoint[] = [];
  const considered: Touchpoint[] = [];
  for (const tp of [...input.touchpoints].sort(byTimeThenId)) {
    let reason: string | null = null;
    if (!tp.partnershipId) reason = 'NO_PARTNERSHIP';
    else if (!tp.eligible) reason = tp.ineligibleReason ?? 'INELIGIBLE';
    else if (tp.method !== 'code' && tp.occurredAt.getTime() < windowStart) reason = 'OUTSIDE_WINDOW';
    else if (tp.occurredAt.getTime() > windowEnd) reason = 'AFTER_CONVERSION';
    competing.push({
      touchpointId: tp.id,
      method: tp.method,
      partnershipId: tp.partnershipId,
      creatorId: tp.creatorId,
      occurredAt: tp.occurredAt.toISOString(),
      considered: reason === null,
      reason,
    });
    if (reason === null) considered.push(tp);
  }

  const base = {
    dedupeState,
    policyId: policy.policyId,
    policyVersion: policy.version,
    model: policy.model,
    windowSeconds: policy.windowSeconds,
    competingTouchpoints: competing,
  };

  if (dedupeState === 'duplicate') {
    return {
      ...base,
      decisionState: 'duplicate',
      conflictState: 'none',
      selectedPartnershipId: null,
      selectedCreatorId: null,
      selectedTouchpointId: null,
      method: 'none',
      reason: 'DUPLICATE_CONVERSION',
    };
  }

  if (considered.length === 0) {
    const hadEvidence = input.touchpoints.some((t) => !!t.partnershipId);
    return {
      ...base,
      decisionState: hadEvidence ? 'invalid' : 'unattributed',
      conflictState: 'none',
      selectedPartnershipId: null,
      selectedCreatorId: null,
      selectedTouchpointId: null,
      method: 'none',
      reason: hadEvidence ? 'NO_ELIGIBLE_TOUCHPOINTS' : 'NO_TOUCHPOINTS',
    };
  }

  const partnerships = distinctPartnerships(considered);
  const conflict = partnerships.length > 1;
  let selected: Touchpoint | null = null;
  let reason = 'SINGLE_PARTNERSHIP';

  if (!conflict) {
    const codes = considered.filter((t) => t.method === 'code');
    selected = codes.length > 0 ? pickExtreme(codes, 'last') : pickExtreme(considered, 'last');
  } else {
    const codes = considered.filter((t) => t.method === 'code');
    const links = considered.filter((t) => isLinkLike(t.method) || t.method === 'other');
    switch (policy.model) {
      case 'code_first':
        if (codes.length > 0) {
          selected = distinctPartnerships(codes).length === 1 ? pickExtreme(codes, 'last') : null;
          reason = selected ? 'CODE_PRECEDENCE' : 'MULTIPLE_CODES';
        } else {
          selected = pickExtreme(links, 'last');
          reason = selected ? 'LAST_LINK_TOUCH' : 'TIED_TOUCHPOINTS';
        }
        break;
      case 'link_first':
        if (links.length > 0) {
          selected = pickExtreme(links, 'last');
          reason = selected ? 'LINK_PRECEDENCE' : 'TIED_TOUCHPOINTS';
        } else {
          selected = distinctPartnerships(codes).length === 1 ? pickExtreme(codes, 'last') : null;
          reason = selected ? 'CODE_FALLBACK' : 'MULTIPLE_CODES';
        }
        break;
      case 'last_touch':
        selected = pickExtreme(considered, 'last');
        reason = selected ? 'LAST_TOUCH' : 'TIED_TOUCHPOINTS';
        break;
      case 'first_touch':
        selected = pickExtreme(considered, 'first');
        reason = selected ? 'FIRST_TOUCH' : 'TIED_TOUCHPOINTS';
        break;
    }
  }

  if (!selected) {
    return {
      ...base,
      decisionState: 'conflicted',
      conflictState: 'unresolved',
      selectedPartnershipId: null,
      selectedCreatorId: null,
      selectedTouchpointId: null,
      method: 'none',
      reason,
    };
  }
  return {
    ...base,
    decisionState: 'attributed',
    conflictState: conflict ? 'conflict' : 'none',
    selectedPartnershipId: selected.partnershipId,
    selectedCreatorId: selected.creatorId,
    selectedTouchpointId: selected.id,
    method: selected.method,
    reason,
  };
}
