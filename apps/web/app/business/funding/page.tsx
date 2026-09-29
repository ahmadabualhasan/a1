'use client';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Card, DataTable, EmptyState, Field, Grid, Input, LoadingState, PageHeader, Select, Stat, StatusBadge } from '@codek/ui';
import { DateText, Money } from '@/components/format';
import { QueryView } from '@/components/query-view';
import { api, errorMessage, toMinorUnits, useApi } from '@/lib/api';
import { useSession } from '@/lib/session';

interface Overview {
  balances: Array<{ currency: string; fundingBalanceMinor: number; outstandingObligationsMinor: number; shortfallMinor: number; approvedUnfundedCount: number }>;
  fundings: Array<{ id: string; amountMinor: number; currency: string; fundingMethod: string; providerReference: string | null; status: string; failureReason: string | null; createdAt: string; receivedAt: string | null }>;
  methods: string[];
  note: string;
}

const METHOD_LABEL: Record<string, string> = { bank_transfer: 'Bank transfer (confirmed by CODEK when received)', sandbox: 'Test funding (non-production only)' };

function AddFunding({ businessId, methods }: { businessId: string; methods: string[] }) {
  const qc = useQueryClient();
  const [f, setF] = useState({ amount: '', currency: 'JOD', fundingMethod: methods[0] ?? 'bank_transfer', providerReference: '' });
  const [key, setKey] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const submit = async () => {
    setMsg(null);
    const amountMinor = toMinorUnits(f.amount, f.currency);
    if (!amountMinor) return setMsg({ tone: 'error', text: `Enter an amount in ${f.currency}` });
    setBusy(true);
    try {
      const r = await api<{ status: string }>(`/businesses/${businessId}/funding`, { method: 'POST', json: { amountMinor, currency: f.currency, fundingMethod: f.fundingMethod, providerReference: f.providerReference || undefined }, idempotencyKey: key });
      setKey(crypto.randomUUID());
      setF({ ...f, amount: '', providerReference: '' });
      setMsg({ tone: 'success', text: r.data.status === 'confirmed' ? 'Funding received.' : 'Funding recorded. It is applied once CODEK confirms the transfer.' });
      await qc.invalidateQueries({ queryKey: [`/businesses/${businessId}/funding`] });
    } catch (e) {
      setMsg({ tone: 'error', text: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card title="Add funding" description="Funding pays approved creator commissions and CODEK fees, oldest first.">
      <form className="grid gap-3 md:grid-cols-2" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <Field label="Amount" required>{(p) => <Input {...p} inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} />}</Field>
        <Field label="Currency">{(p) => <Select {...p} value={f.currency} onChange={(e) => setF({ ...f, currency: e.target.value })} options={['JOD', 'USD', 'AED', 'SAR', 'EUR'].map((c) => ({ value: c, label: c }))} />}</Field>
        <Field label="Method">{(p) => <Select {...p} value={f.fundingMethod} onChange={(e) => setF({ ...f, fundingMethod: e.target.value })} options={methods.map((m) => ({ value: m, label: METHOD_LABEL[m] ?? m }))} />}</Field>
        <Field label="Transfer reference" hint="Your bank reference, so we can match the transfer">{(p) => <Input {...p} value={f.providerReference} onChange={(e) => setF({ ...f, providerReference: e.target.value })} />}</Field>
        {msg && <div className="md:col-span-2"><Alert tone={msg.tone}>{msg.text}</Alert></div>}
        <div><Button type="submit" loading={busy}>Add funding</Button></div>
      </form>
    </Card>
  );
}

export default function FundingPage() {
  const { businessId, can } = useSession();
  const q = useApi<Overview>(businessId ? `/businesses/${businessId}/funding` : null);
  if (!businessId) return <LoadingState />;
  return (
    <div className="space-y-6">
      <PageHeader title="Funding" description="What you owe creators and how much funding you have provided." />
      <QueryView query={q}>
        {(d) => (
          <>
            {d.balances.length === 0 ? <EmptyState title="Nothing owed yet" description="Obligations appear once creator sales are approved." /> : d.balances.map((b) => (
              <div key={b.currency} className="space-y-3">
                <Grid cols={3}>
                  <Stat label={`Unallocated funding (${b.currency})`} value={<Money minor={b.fundingBalanceMinor} currency={b.currency} />} />
                  <Stat label="Owed to creators + fees" value={<Money minor={b.outstandingObligationsMinor} currency={b.currency} />} />
                  <Stat label="Shortfall" value={<Money minor={b.shortfallMinor} currency={b.currency} />} hint={`${b.approvedUnfundedCount} approved commission(s) waiting`} />
                </Grid>
                {Number(b.shortfallMinor) > 0 && <Alert tone="warning">Add at least <Money minor={b.shortfallMinor} currency={b.currency} /> so approved commissions can be paid to creators.</Alert>}
              </div>
            ))}
            <p className="text-xs text-slate-500">{d.note}</p>
            {can('funding.manage') && <AddFunding businessId={businessId} methods={d.methods} />}
            <Card title="Funding history">
              <DataTable
                caption="Funding history"
                rowKey={(r) => r.id}
                rows={d.fundings}
                empty={<p className="text-sm text-slate-500">No funding yet.</p>}
                columns={[
                  { key: 'd', header: 'Date', render: (r) => <DateText value={r.createdAt} withTime /> },
                  { key: 'a', header: 'Amount', render: (r) => <Money minor={r.amountMinor} currency={r.currency} /> },
                  { key: 'm', header: 'Method', render: (r) => r.fundingMethod.replace('_', ' ') },
                  { key: 'r', header: 'Reference', render: (r) => r.providerReference ?? '—' },
                  { key: 's', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
                  { key: 'f', header: 'Note', render: (r) => r.failureReason ?? '' },
                ]}
              />
            </Card>
          </>
        )}
      </QueryView>
    </div>
  );
}
