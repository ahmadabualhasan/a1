'use client';
import Link from 'next/link';
import { Alert, Card, DataTable, EmptyState, PageHeader } from '@codek/ui';
import { Money } from '@/components/format';
import { QueryView } from '@/components/query-view';
import { formatRate, useApi } from '@/lib/api';

interface Earnings {
  currencies: Array<{ currency: string; totalMinor: number; pendingMinor: number; approvedMinor: number; availableMinor: number; payoutInProgressMinor: number; paidMinor: number; clawbackOutstandingMinor: number }>;
  explanation: { pending: string; approved: string; available: string; paid: string };
}
interface PerPartnership { items: Array<{ partnershipId: string; campaign: string; business: string; clicks: number; conversions: number; currency: string; commissionMinor: number; conversionRate: string | null }>; provenance: { note: string; metricDefinitionVersion: string } }

export default function CreatorEarnings() {
  const q = useApi<Earnings>('/creator/earnings');
  const perP = useApi<PerPartnership>('/creator/analytics');
  return (
    <div className="space-y-6">
      <PageHeader title="Earnings" description="What you have earned, what is still pending and what you can withdraw." actions={<Link className="font-medium text-brand-700 underline" href="/creator/payouts">Request a payout</Link>} />
      <QueryView query={q} isEmpty={(d) => d.currencies.length === 0} empty={<EmptyState title="No earnings yet" description="Earnings appear after your first attributed sale." />}>
        {(d) => (
          <div className="space-y-6">
            {d.currencies.map((c) => (
              <Card key={c.currency} title={`Earnings in ${c.currency}`}>
                <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {[
                    ['Pending', c.pendingMinor, d.explanation.pending],
                    ['Approved', c.approvedMinor, d.explanation.approved],
                    ['Available to withdraw', c.availableMinor, d.explanation.available],
                    ['Payout in progress', c.payoutInProgressMinor, 'Requested payouts being processed by the payout provider.'],
                    ['Paid', c.paidMinor, d.explanation.paid],
                    ['Total earned', c.totalMinor, 'Pending + approved + available + in progress + paid.'],
                  ].map(([label, v, help]) => (
                    <div key={String(label)} className="rounded-lg border border-slate-200 p-4">
                      <dt className="text-sm text-slate-500">{label}</dt>
                      <dd className="mt-1 text-xl font-semibold"><Money minor={v as number} currency={c.currency} /></dd>
                      <p className="mt-1 text-xs text-slate-500">{help}</p>
                    </div>
                  ))}
                </dl>
                {Number(c.clawbackOutstandingMinor) > 0 && (
                  <div className="mt-4">
                    <Alert tone="warning">
                      <Money minor={c.clawbackOutstandingMinor} currency={c.currency} /> is owed back because of refunds after payout. It is deducted from your next payout.
                    </Alert>
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}
      </QueryView>
      <Card title="By partnership (last 30 days)">
        <QueryView query={perP} isEmpty={(d) => d.items.length === 0} empty={<p className="text-sm text-slate-500">No partnerships yet.</p>}>
          {(d) => (
            <>
              <DataTable
                caption="Performance by partnership"
                rowKey={(r) => r.partnershipId}
                rows={d.items}
                columns={[
                  { key: 'c', header: 'Campaign', render: (r) => <Link className="font-medium hover:underline" href={`/creator/partnerships/${r.partnershipId}`}>{r.campaign}</Link> },
                  { key: 'b', header: 'Business', render: (r) => r.business },
                  { key: 'clicks', header: 'Link clicks', render: (r) => r.clicks },
                  { key: 'conv', header: 'Confirmed sales', render: (r) => r.conversions },
                  { key: 'rate', header: 'Conversion rate', render: (r) => (r.conversionRate ? formatRate(r.conversionRate) : '—') },
                  { key: 'comm', header: 'Commission', render: (r) => <Money minor={r.commissionMinor} currency={r.currency} /> },
                ]}
              />
              <p className="mt-2 text-xs text-slate-500">{d.provenance.note} (definitions {d.provenance.metricDefinitionVersion})</p>
            </>
          )}
        </QueryView>
      </Card>
    </div>
  );
}
