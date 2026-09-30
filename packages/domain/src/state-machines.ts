import { DomainError } from './errors';

/**
 * Explicit lifecycle state machines (spec §3.4, §4.5-4.7, §8.3, §10.5, §11.2, §13.2-13.3, §16.3).
 * All server-side state changes must go through `assertTransition`.
 */
export type TransitionTable<S extends string> = Readonly<Record<S, readonly S[]>>;

export interface StateMachine<S extends string> {
  name: string;
  states: readonly S[];
  transitions: TransitionTable<S>;
  terminal: readonly S[];
}

function machine<S extends string>(name: string, transitions: Readonly<Record<S, readonly NoInfer<S>[]>>): StateMachine<S> {
  const states = Object.keys(transitions) as S[];
  return { name, states, transitions, terminal: states.filter((s) => transitions[s].length === 0) };
}

export function canTransition<S extends string>(m: StateMachine<S>, from: S, to: S): boolean {
  return (m.transitions[from] ?? []).includes(to);
}

export function assertTransition<S extends string>(m: StateMachine<S>, from: S, to: S): void {
  if (!canTransition(m, from, to)) {
    throw new DomainError('INVALID_STATE_TRANSITION', `Cannot change ${m.name} from ${from} to ${to}`, {
      machine: m.name,
      from,
      to,
    });
  }
}

export const CampaignMachine = machine('campaign', {
  draft: ['pending_review', 'archived'],
  pending_review: ['published', 'draft'],
  published: ['active', 'paused', 'ended'],
  active: ['paused', 'ended'],
  paused: ['active', 'published', 'ended'],
  ended: ['archived'],
  archived: [],
} as const);
export type CampaignStatus = (typeof CampaignMachine.states)[number];

export const ApplicationMachine = machine('application', {
  pending: ['accepted', 'rejected', 'withdrawn', 'waitlisted', 'expired'],
  waitlisted: ['accepted', 'rejected', 'withdrawn', 'expired'],
  accepted: [],
  rejected: [],
  withdrawn: [],
  expired: [],
} as const);
export type ApplicationStatus = (typeof ApplicationMachine.states)[number];

export const InvitationMachine = machine('invitation', {
  pending: ['accepted', 'declined', 'revoked', 'expired'],
  accepted: [],
  declined: [],
  revoked: [],
  expired: [],
} as const);
export type InvitationStatus = (typeof InvitationMachine.states)[number];

export const PartnershipMachine = machine('partnership', {
  pending: ['active', 'cancelled'],
  active: ['paused', 'completed', 'cancelled', 'disputed', 'terminated'],
  paused: ['active', 'completed', 'cancelled', 'disputed', 'terminated'],
  disputed: ['active', 'paused', 'completed', 'terminated'],
  completed: [],
  cancelled: [],
  terminated: [],
} as const);
export type PartnershipStatus = (typeof PartnershipMachine.states)[number];

export const PromotionAssetMachine = machine('promotion asset', {
  pending: ['active', 'revoked'],
  active: ['paused', 'expired', 'revoked'],
  paused: ['active', 'expired', 'revoked'],
  expired: ['revoked'],
  revoked: [],
} as const);
export type PromotionAssetStatus = (typeof PromotionAssetMachine.states)[number];

export const ConversionMachine = machine('conversion', {
  received: ['validated', 'rejected'],
  validated: ['attributed', 'rejected', 'cancelled', 'refunded'],
  attributed: ['approved', 'rejected', 'cancelled', 'refunded', 'partially_refunded'],
  approved: ['refunded', 'partially_refunded', 'reversed', 'cancelled'],
  partially_refunded: ['refunded', 'partially_refunded', 'reversed', 'approved'],
  rejected: [],
  cancelled: [],
  refunded: [],
  reversed: [],
} as const);
export type ConversionStatus = (typeof ConversionMachine.states)[number];

export const CommissionMachine = machine('commission', {
  pending: ['approved', 'reversed'],
  approved: ['funded', 'reversed'],
  funded: ['available', 'reversed'],
  available: ['payout_requested', 'reversed', 'clawback'],
  payout_requested: ['processing', 'available', 'reversed'],
  processing: ['paid', 'available'],
  paid: ['clawback', 'available'], // available: the provider returned the payout
  reversed: [],
  clawback: [],
} as const);
export type CommissionStatus = (typeof CommissionMachine.states)[number];

export const PayoutMachine = machine('payout', {
  available: ['requested'],
  requested: ['processing', 'cancelled', 'failed'],
  processing: ['paid', 'failed'],
  failed: ['processing', 'cancelled'],
  paid: ['reversed'],
  reversed: [],
  cancelled: [],
} as const);
export type PayoutStatus = (typeof PayoutMachine.states)[number];

export const FundingMachine = machine('funding', {
  pending: ['confirmed', 'failed'],
  confirmed: ['reversed'],
  failed: [],
  reversed: [],
} as const);
export type FundingStatus = (typeof FundingMachine.states)[number];

export const DeliverableMachine = machine('deliverable', {
  not_started: ['submitted'],
  submitted: ['approved', 'changes_requested'],
  changes_requested: ['resubmitted'],
  resubmitted: ['approved', 'changes_requested'],
  approved: [],
} as const);
export type DeliverableStatus = (typeof DeliverableMachine.states)[number];

export const DisputeMachine = machine('dispute', {
  open: ['evidence', 'hold', 'review', 'closed'],
  evidence: ['hold', 'review', 'closed'],
  hold: ['review', 'evidence'],
  review: ['decision', 'evidence'],
  decision: ['adjustment', 'closed'],
  adjustment: ['closed'],
  closed: [],
} as const);
export type DisputeStatus = (typeof DisputeMachine.states)[number];

export const FraudCaseMachine = machine('fraud case', {
  open: ['evidence', 'review', 'closed'],
  evidence: ['review'],
  review: ['decision', 'evidence'],
  decision: ['closed'],
  closed: [],
} as const);
export type FraudCaseStatus = (typeof FraudCaseMachine.states)[number];

export const FraudFlagMachine = machine('fraud flag', {
  open: ['reviewing', 'resolved', 'dismissed'],
  reviewing: ['resolved', 'dismissed'],
  resolved: [],
  dismissed: [],
} as const);
export type FraudFlagStatus = (typeof FraudFlagMachine.states)[number];

export const IntegrationMachine = machine('integration', {
  not_connected: ['connecting'],
  connecting: ['connected', 'error', 'disconnected'],
  connected: ['testing', 'live', 'paused', 'error', 'disconnected'],
  testing: ['live', 'connected', 'error', 'disconnected'],
  live: ['paused', 'error', 'disconnected', 'testing'],
  paused: ['live', 'connected', 'testing', 'disconnected'],
  error: ['connecting', 'connected', 'testing', 'disconnected'],
  disconnected: ['connecting'],
} as const);
export type IntegrationStatus = (typeof IntegrationMachine.states)[number];

export const VerificationMachine = machine('verification', {
  unverified: ['pending'],
  pending: ['verified', 'unverified'],
  verified: ['suspended', 'expired'],
  suspended: ['verified', 'pending'],
  expired: ['pending'],
} as const);
export type VerificationStatus = (typeof VerificationMachine.states)[number];

export const MemberMachine = machine('membership', {
  invited: ['active', 'revoked'],
  active: ['revoked'],
  revoked: [],
} as const);
export type MemberStatus = (typeof MemberMachine.states)[number];
