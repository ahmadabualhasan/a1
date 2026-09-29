'use client';
import Link from 'next/link';
import { Alert, Card, EmptyState, Grid, LoadingState, PageHeader, Stat, StatusBadge } from '@codek/ui';
import { DateText, Money } from '@/components/format';
import { useApi } from '@/lib/api';

export interface Earnings {
  currencies: Array<{ currency: string; totalMinor: number; pendingMinor: number; approvedMinor: number; availableMinor: number; payoutInProgressMinor: number; paidMinor: number; clawbackOutstandingMinor: number }>;
  explanation: Record<string, string>;
}
interface CreatorProfile { id: string; handle: string; displayName: string; verificationStatus: string; payoutReadiness: string; socialAccounts: unknown[] }
interface PartnershipRow { id: string; status: string; campaign: { id: string; name: string }; business: { displayName: string }; promotionCodes: Array<{ code: string }> }
interface Invitation { id: string; status: string }
interface Sale { id: string; status: string; occurredAt: string; currency: string | null; commission: { commissionMinor: number; status: string } | null }

export default function CreatorDashboard() {
  const profile = useApi<CreatorProfile | null>('/creator/profile');
  const earnings = useApi<Earnings>('/creator/earnings');
  const partnerships = useApi<PartnershipRow[]>('/creator/partnerships?limit=5&status=active');
  const invitations = useApi<Invitation[]>('/creator/invitations');
  const sales = useApi<Sale[]>('/creator/sales?limit=5');
  const pendingInvites = invitations.data?.data.filter((i) => i.status === 'pending').length ?? 0;
  const p = profile.data?.data;
  const actions: Array<{ href: string; text: string }> = [];
  if (p && p.payoutReadiness !== 'ready') actions.push({ href: '/creator/payouts', text: 'Add a payout method so you can get paid' });
  if (p && p.socialAccounts.length === 0) actions.push({ href: '/creator/profile', text: 'Add your social accounts so businesses can evaluate your reach' });
  if (p && p.verificationStatus === 'unverified') actions.push({ href: '/creator/profile', text: 'Request verification to unlock verified-only campaigns' });
  if (pendingInvites) actions.push({ href: '/creator/invitations', text: `Respond to ${pendingInvites} campaign invitation${pendingInvites > 1 ? 's' : ''}` });
  return (
    <div className="space-y-8">
      <PageHeader title={p ? `Welcome, ${p.displayName}` : 'Dashboard'} description="Your partnerships, sales and earnings at a glance." />
      {actions.length > 0 && (
        <Alert tone="info">
          <p className="font-medium">Next steps</p>
          <ul className="mt-1 list-disc pl-5">
            {actions.map((a) => (
              <li key={a.href + a.text}><Link className="underline" href={a.href}>{a.text}</Link></li>
            ))}
          </ul>
        </Alert>
      )}
      {earnings.isLoading ? <LoadingState /> : (
        <section aria-labelledby="earn-h" className="space-y-3">
          <h2 id="earn-h" className="text-lg font-semibold">Earnings</h2>
          {!earnings.data?.data.currencies.length ? (
            <EmptyState title="No earnings yet" description="When customers buy with your code or link, your commission appears here." action={<Link className="font-medium text-brand-700 underline" href="/creator/marketplace">Find a campaign</Link>} />
          ) : (
            earnings.data.data.currencies.map((c) => (
              <Grid key={c.currency} cols={4}>
                <Stat label={`Pending (${c.currency})`} value={<Money minor={c.pendingMinor} currency={c.currency} />} hint="Waiting for payment confirmation or approval" />
                <Stat label="Approved" value={<Money minor={c.approvedMinor} currency={c.currency} />} hint="Waiting for funding or hold period" />
                <Stat label="Available to withdraw" value={<Money minor={c.availableMinor} currency={c.currency} />} />
                <Stat label="Paid" value={<Money minor={c.paidMinor} currency={c.currency} />} />
              </Grid>
            ))
          )}
        </section>
      )}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Active partnerships" actions={<Link className="text-sm text-brand-700 underline" href="/creator/partnerships">View all</Link>}>
          {partnerships.isLoading ? <LoadingState /> : !partnerships.data?.data.length ? (
            <p className="text-sm text-slate-500">No active partnerships yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {partnerships.data.data.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <Link href={`/creator/partnerships/${r.id}`} className="font-medium text-slate-900 hover:underline">{r.campaign.name}<span className="ml-2 font-normal text-slate-500">{r.business.displayName}</span></Link>
                  <code className="rounded bg-slate-100 px-2 py-0.5 text-xs">{r.promotionCodes[0]?.code}</code>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Recent sales" actions={<Link className="text-sm text-brand-700 underline" href="/creator/sales">View all</Link>}>
          {sales.isLoading ? <LoadingState /> : !sales.data?.data.length ? (
            <p className="text-sm text-slate-500">No sales yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {sales.data.data.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <DateText value={s.occurredAt} />
                  <StatusBadge status={s.status} />
                  <span className="font-medium">{s.commission ? <Money minor={s.commission.commissionMinor} currency={s.currency} /> : '—'}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
