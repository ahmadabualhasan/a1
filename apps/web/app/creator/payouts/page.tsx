'use client';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Card, ConfirmButton, DataTable, EmptyState, Field, Input, PageHeader, Select, StatusBadge } from '@codek/ui';
import { DateText, Money } from '@/components/format';
import { PagedList } from '@/components/paged';
import { api, errorMessage, toMinorUnits, useApi, useApiMutation } from '@/lib/api';

interface Profile { payoutReadiness: string; payoutMethod: { type: string; email: string } | null }
interface Earnings { currencies: Array<{ currency: string; availableMinor: number; clawbackOutstandingMinor: number }> }
interface Payout {
  id: string;
  amountMinor: number;
  currency: string;
  status: string;
  provider: string;
  requestedAt: string;
  processedAt: string | null;
  failureReasonCode: string | null;
  riskHold: boolean;
  attempts: Array<{ attemptNumber: number; status: string; errorMessageSafe: string | null }>;
}

function PayoutMethodCard({ profile }: { profile: Profile }) {
  const [email, setEmail] = useState(profile.payoutMethod?.email ?? '');
  const [saved, setSaved] = useState(false);
  const save = useApiMutation<{ type: 'paypal'; email: string }>('PATCH', '/creator/payout-method', { invalidate: ['/creator/profile'], onSuccess: () => setSaved(true) });
  return (
    <Card title="Payout method" description="Payouts are sent by our payout provider to your account. CODEK does not store your bank or card details.">
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); setSaved(false); save.mutate({ type: 'paypal', email }); }}>
        <Field label="PayPal email" required>
          {(p) => <Input {...p} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />}
        </Field>
        {save.error && <Alert tone="error">{errorMessage(save.error)}</Alert>}
        {saved && <Alert tone="success">Payout method saved.</Alert>}
        <div className="flex items-center gap-3">
          <Button type="submit" loading={save.isPending}>Save payout method</Button>
          <StatusBadge status={profile.payoutReadiness} />
        </div>
      </form>
    </Card>
  );
}

function RequestCard({ earnings, ready }: { earnings: Earnings; ready: boolean }) {
  const qc = useQueryClient();
  const withBalance = earnings.currencies.filter((c) => Number(c.availableMinor) > 0);
  const [currency, setCurrency] = useState(withBalance[0]?.currency ?? '');
  const [amount, setAmount] = useState('');
  // One key per intended payout: retries after a network error reuse it, so a payout is never requested twice.
  const [key, setKey] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const selected = earnings.currencies.find((c) => c.currency === currency);
  if (!withBalance.length) return <Card title="Request a payout"><p className="text-sm text-slate-600">You have no available balance yet. Commissions become available after approval, funding by the business and the hold period.</p></Card>;
  const submit = async () => {
    setMsg(null);
    let amountMinor: number | undefined;
    if (amount.trim()) {
      const v = toMinorUnits(amount, currency);
      if (v == null || v <= 0) return setMsg({ tone: 'error', text: 'Enter a valid amount, or leave it empty to withdraw everything available.' });
      amountMinor = v;
    }
    setBusy(true);
    try {
      await api('/creator/payouts/request', { method: 'POST', json: { currency, amountMinor }, idempotencyKey: key });
      setKey(crypto.randomUUID());
      setAmount('');
      setMsg({ tone: 'success', text: 'Payout requested. You will be notified when it is sent.' });
      await qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith('/creator/') });
    } catch (e) {
      setMsg({ tone: 'error', text: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card title="Request a payout">
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Currency">{(p) => <Select {...p} value={currency} onChange={(e) => setCurrency(e.target.value)} options={withBalance.map((c) => ({ value: c.currency, label: c.currency }))} />}</Field>
          <Field label="Amount (optional)" hint="Leave empty to withdraw everything available.">{(p) => <Input {...p} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.000" />}</Field>
        </div>
        {selected && <p className="text-sm text-slate-600">Available: <Money minor={selected.availableMinor} currency={currency} />{Number(selected.clawbackOutstandingMinor) > 0 && <> (after deducting <Money minor={selected.clawbackOutstandingMinor} currency={currency} /> owed from refunds)</>}</p>}
        {!ready && <Alert tone="warning">Add a payout method before requesting a payout.</Alert>}
        {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
        <Button disabled={!ready} loading={busy} onClick={submit}>Request payout</Button>
      </div>
    </Card>
  );
}

export default function CreatorPayouts() {
  const qc = useQueryClient();
  const profile = useApi<Profile>('/creator/profile');
  const earnings = useApi<Earnings>('/creator/earnings');
  return (
    <div className="space-y-6">
      <PageHeader title="Payouts" description="Withdraw your available earnings." />
      <div className="grid gap-6 lg:grid-cols-2">
        {profile.data && <PayoutMethodCard profile={profile.data.data} />}
        {earnings.data && profile.data && <RequestCard earnings={earnings.data.data} ready={profile.data.data.payoutReadiness === 'ready'} />}
      </div>
      <h2 className="text-lg font-semibold">Payout history</h2>
      <PagedList<Payout> path="/creator/payouts" empty={<EmptyState title="No payouts yet" />}>
        {(rows) => (
          <DataTable
            caption="Payout history"
            rowKey={(r) => r.id}
            rows={rows}
            columns={[
              { key: 'date', header: 'Requested', render: (r) => <DateText value={r.requestedAt} withTime /> },
              { key: 'amount', header: 'Amount', render: (r) => <Money minor={r.amountMinor} currency={r.currency} /> },
              { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.riskHold ? 'on_hold' : r.status} /> },
              { key: 'done', header: 'Completed', render: (r) => <DateText value={r.processedAt} withTime /> },
              { key: 'info', header: 'Details', className: 'whitespace-normal max-w-xs', render: (r) => r.attempts.at(-1)?.errorMessageSafe ?? (r.status === 'processing' ? `Attempt ${r.attempts.length}` : '—') },
              {
                key: 'a',
                header: '',
                render: (r) =>
                  r.status === 'requested' ? (
                    <ConfirmButton
                      label="Cancel"
                      title="Cancel this payout?"
                      consequence="The amount returns to your available balance."
                      confirmLabel="Cancel payout"
                      onConfirm={async () => {
                        await api(`/creator/payouts/${r.id}/cancel`, { method: 'POST', json: {} });
                        await qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith('/creator/') });
                      }}
                    />
                  ) : null,
              },
            ]}
          />
        )}
      </PagedList>
    </div>
  );
}
