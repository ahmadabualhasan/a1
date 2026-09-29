import { cn } from './cn';

type Tone = 'gray' | 'green' | 'yellow' | 'red' | 'blue' | 'purple';

const toneClass: Record<Tone, string> = {
  gray: 'bg-slate-100 text-slate-700 ring-slate-200',
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  yellow: 'bg-amber-50 text-amber-800 ring-amber-200',
  red: 'bg-red-50 text-red-700 ring-red-200',
  blue: 'bg-sky-50 text-sky-700 ring-sky-200',
  purple: 'bg-violet-50 text-violet-700 ring-violet-200',
};

export function Badge({ tone = 'gray', children }: { tone?: Tone; children: React.ReactNode }) {
  return <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset', toneClass[tone])}>{children}</span>;
}

/** Plain-language labels and colours for lifecycle states shown to non-technical users (spec §22.1). */
const STATUS: Record<string, { label: string; tone: Tone }> = {
  draft: { label: 'Draft', tone: 'gray' },
  pending_review: { label: 'In review', tone: 'yellow' },
  published: { label: 'Published', tone: 'blue' },
  active: { label: 'Active', tone: 'green' },
  paused: { label: 'Paused', tone: 'yellow' },
  ended: { label: 'Ended', tone: 'gray' },
  archived: { label: 'Archived', tone: 'gray' },
  pending: { label: 'Pending', tone: 'yellow' },
  waitlisted: { label: 'Waitlisted', tone: 'purple' },
  accepted: { label: 'Accepted', tone: 'green' },
  rejected: { label: 'Not accepted', tone: 'red' },
  withdrawn: { label: 'Withdrawn', tone: 'gray' },
  expired: { label: 'Expired', tone: 'gray' },
  declined: { label: 'Declined', tone: 'gray' },
  revoked: { label: 'Revoked', tone: 'red' },
  completed: { label: 'Completed', tone: 'blue' },
  cancelled: { label: 'Cancelled', tone: 'gray' },
  terminated: { label: 'Terminated', tone: 'red' },
  disputed: { label: 'In dispute', tone: 'red' },
  received: { label: 'Received', tone: 'gray' },
  validated: { label: 'Recorded', tone: 'gray' },
  attributed: { label: 'Credited to creator', tone: 'blue' },
  approved: { label: 'Approved', tone: 'green' },
  refunded: { label: 'Refunded', tone: 'red' },
  partially_refunded: { label: 'Partly refunded', tone: 'yellow' },
  reversed: { label: 'Reversed', tone: 'red' },
  funded: { label: 'Funded', tone: 'blue' },
  available: { label: 'Available', tone: 'green' },
  payout_requested: { label: 'Payout requested', tone: 'purple' },
  processing: { label: 'Processing', tone: 'purple' },
  paid: { label: 'Paid', tone: 'green' },
  clawback: { label: 'Recovered', tone: 'red' },
  requested: { label: 'Requested', tone: 'purple' },
  failed: { label: 'Failed', tone: 'red' },
  confirmed: { label: 'Confirmed', tone: 'green' },
  not_started: { label: 'Not started', tone: 'gray' },
  submitted: { label: 'Submitted', tone: 'blue' },
  changes_requested: { label: 'Changes requested', tone: 'yellow' },
  resubmitted: { label: 'Resubmitted', tone: 'blue' },
  verified: { label: 'Verified', tone: 'green' },
  self_reported: { label: 'Self-reported', tone: 'yellow' },
  unverified: { label: 'Unverified', tone: 'gray' },
  suspended: { label: 'Suspended', tone: 'red' },
  not_connected: { label: 'Not connected', tone: 'gray' },
  connecting: { label: 'Connecting', tone: 'yellow' },
  connected: { label: 'Connected', tone: 'blue' },
  testing: { label: 'Testing', tone: 'yellow' },
  live: { label: 'Live', tone: 'green' },
  error: { label: 'Needs attention', tone: 'red' },
  disconnected: { label: 'Disconnected', tone: 'gray' },
  open: { label: 'Open', tone: 'yellow' },
  evidence: { label: 'Collecting evidence', tone: 'yellow' },
  hold: { label: 'On hold', tone: 'red' },
  review: { label: 'Under review', tone: 'purple' },
  decision: { label: 'Decided', tone: 'blue' },
  adjustment: { label: 'Adjusting', tone: 'purple' },
  closed: { label: 'Closed', tone: 'gray' },
  matched: { label: 'Matched', tone: 'green' },
  mismatch: { label: 'Mismatch', tone: 'red' },
  missing_local: { label: 'Missing in CODEK', tone: 'red' },
  missing_external: { label: 'Missing at provider', tone: 'yellow' },
  needs_review: { label: 'Needs review', tone: 'yellow' },
  dead_letter: { label: 'Failed permanently', tone: 'red' },
  processed: { label: 'Processed', tone: 'green' },
  queued: { label: 'Queued', tone: 'purple' },
  ignored: { label: 'Ignored', tone: 'gray' },
  not_required: { label: 'Executed', tone: 'green' },
};

export function StatusBadge({ status }: { status: string | null | undefined }) {
  if (!status) return <Badge>—</Badge>;
  const s = STATUS[status] ?? { label: status.replace(/_/g, ' '), tone: 'gray' as Tone };
  return <Badge tone={s.tone}>{s.label}</Badge>;
}
