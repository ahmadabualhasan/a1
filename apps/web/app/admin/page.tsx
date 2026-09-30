'use client';
import Link from 'next/link';
import { Alert, Card, Grid, PageHeader, Stat } from '@codek/ui';
import { QueryView } from '@/components/query-view';
import { useApi } from '@/lib/api';
import { useSession } from '@/lib/session';

interface Overview {
  users: number;
  businesses: number;
  creators: number;
  queues: { pendingCampaigns: number; pendingVerifications: number; openFlags: number; openCases: number; openDisputes: number; webhookDeadLetters: number; failedPayouts: number; unresolvedReconciliationItems: number; pendingAdminApprovals: number; pendingFundings: number };
  ledgerInvariantsOk: boolean;
}

const QUEUES: Array<[keyof Overview['queues'], string, string]> = [
  ['pendingAdminApprovals', 'Actions awaiting second approval', '/admin/approvals'],
  ['pendingCampaigns', 'Campaigns to review', '/admin/campaigns'],
  ['pendingVerifications', 'Verification requests', '/admin/verification'],
  ['pendingFundings', 'Fundings to confirm', '/admin/finance'],
  ['failedPayouts', 'Failed payouts', '/admin/finance'],
  ['webhookDeadLetters', 'Webhook dead letters', '/admin/integrations'],
  ['unresolvedReconciliationItems', 'Reconciliation differences', '/admin/integrations'],
  ['openFlags', 'Open fraud flags', '/admin/fraud'],
  ['openCases', 'Open fraud cases', '/admin/fraud'],
  ['openDisputes', 'Open disputes', '/admin/disputes'],
];

export default function AdminOverview() {
  const { session } = useSession();
  const q = useApi<Overview>('/admin/overview', { refetchInterval: 60_000 });
  return (
    <div className="space-y-6">
      <PageHeader title="Operations overview" />
      {session && !session.user.twoFactorEnabled && <Alert tone="warning">Enable two-factor authentication on your account. It is required for administrators outside development. <Link className="underline" href="/account/security">Security settings</Link></Alert>}
      <QueryView query={q}>
        {(o) => (
          <>
            {!o.ledgerInvariantsOk && <Alert tone="error">Ledger invariant check failed. Investigate before processing payouts. <Link className="underline" href="/admin/finance">Ledger</Link></Alert>}
            <Grid cols={4}>
              <Stat label="Users" value={o.users} />
              <Stat label="Businesses" value={o.businesses} />
              <Stat label="Creators" value={o.creators} />
              <Stat label="Ledger invariants" value={o.ledgerInvariantsOk ? 'OK' : 'FAILED'} />
            </Grid>
            <Card title="Work queues">
              <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {QUEUES.map(([k, label, href]) => (
                  <li key={k}>
                    <Link href={href} className={`flex items-center justify-between rounded-lg border px-3 py-2 text-sm hover:bg-slate-50 ${o.queues[k] ? 'border-amber-300 bg-amber-50' : 'border-slate-200'}`}>
                      <span>{label}</span>
                      <span className="font-semibold tabular-nums">{o.queues[k]}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          </>
        )}
      </QueryView>
    </div>
  );
}
