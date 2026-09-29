'use client';
import { Alert, Button, Card, DataTable, DescriptionList, LoadingState, PageHeader, StatusBadge } from '@codek/ui';
import { DateText, Money } from '@/components/format';
import { QueryView } from '@/components/query-view';
import { errorMessage, useApi, useApiMutation } from '@/lib/api';
import { useSession } from '@/lib/session';

interface Billing {
  subscription: { planKey: string; status: string; periodEnd: string | null } | null;
  invoices: Array<{ id: string; providerInvoiceId: string | null; status: string; amountMinor: number; currency: string; periodStart: string | null; periodEnd: string | null; createdAt: string }>;
  currentFeePlan: { description: string };
  subscriptionsEnabled: boolean;
}
interface Plan { planKey: string; name: string; description: string | null; monthlyPriceMinor: number | null; currency: string | null; fee: string; isDefault: boolean }

export default function BillingPage() {
  const { businessId, can } = useSession();
  const q = useApi<Billing>(businessId ? `/businesses/${businessId}/billing` : null);
  const plans = useApi<Plan[]>('/pricing');
  const subscribe = useApiMutation<{ planKey: string }>('POST', `/businesses/${businessId}/billing/subscribe`, { invalidate: [`/businesses/${businessId}/billing`] });
  if (!businessId) return <LoadingState />;
  return (
    <div className="space-y-6">
      <PageHeader title="Billing" description="CODEK fees and invoices. Creator commissions are shown under Funding." />
      <QueryView query={q}>
        {(b) => (
          <>
            <Card title="Your plan">
              <DescriptionList items={[{ label: 'CODEK fee', value: b.currentFeePlan.description }, { label: 'Subscription', value: b.subscription ? <>{b.subscription.planKey} <StatusBadge status={b.subscription.status} /></> : 'None' }]} />
            </Card>
            {b.subscriptionsEnabled && can('funding.manage') && (
              <Card title="Plans">
                <QueryView query={plans}>
                  {(ps) => (
                    <div className="grid gap-4 md:grid-cols-3">
                      {ps.map((p) => (
                        <div key={p.planKey} className="rounded-xl border border-slate-200 p-4">
                          <p className="font-semibold">{p.name}</p>
                          <p className="text-sm text-slate-600">{p.description}</p>
                          <p className="mt-2 text-sm">{p.monthlyPriceMinor ? <><Money minor={p.monthlyPriceMinor} currency={p.currency} /> / month</> : 'No monthly fee'} · {p.fee}</p>
                          <Button className="mt-3" size="sm" variant={b.subscription?.planKey === p.planKey ? 'secondary' : 'primary'} disabled={b.subscription?.planKey === p.planKey} loading={subscribe.isPending} onClick={() => subscribe.mutate({ planKey: p.planKey })}>
                            {b.subscription?.planKey === p.planKey ? 'Current plan' : 'Choose'}
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </QueryView>
                {subscribe.error && <div className="mt-3"><Alert tone="error">{errorMessage(subscribe.error)}</Alert></div>}
              </Card>
            )}
            <Card title="Invoices">
              <DataTable
                caption="Invoices"
                rowKey={(r) => r.id}
                rows={b.invoices}
                empty={<p className="text-sm text-slate-500">No invoices yet.</p>}
                columns={[
                  { key: 'n', header: 'Invoice', render: (r) => r.providerInvoiceId ?? r.id.slice(0, 8) },
                  { key: 'p', header: 'Period', render: (r) => <><DateText value={r.periodStart} /> – <DateText value={r.periodEnd} /></> },
                  { key: 't', header: 'Total', render: (r) => <Money minor={r.amountMinor} currency={r.currency} /> },
                  { key: 's', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
                ]}
              />
            </Card>
          </>
        )}
      </QueryView>
    </div>
  );
}
