'use client';
import { useState } from 'react';
import { Alert, Button, Card, DataTable, EmptyState, Field, Input, PageHeader, Select, StatusBadge, Tabs } from '@codek/ui';
import { JsonBlock, ReasonButton, useRunner } from '@/components/admin';
import { DateText, Money } from '@/components/format';
import { PagedList } from '@/components/paged';
import { QueryView } from '@/components/query-view';
import { toMinorUnits, useApi } from '@/lib/api';

interface Balance { accountType: string; currency: string; balanceMinor: number; ownerId?: string | null }
interface Entry { id: string; entryType: string; referenceType: string | null; referenceId: string | null; currency: string; createdAt: string; description: string | null; lines: Array<{ id: string; direction: string; amountMinor: number; account: { accountType: string; ownerType: string; ownerId: string | null } }> }
interface Funding { id: string; amountMinor: number; currency: string; fundingMethod: string; providerReference: string | null; status: string; createdAt: string; business: { displayName: string } }
interface Payout { id: string; amountMinor: number; currency: string; status: string; provider: string; requestedAt: string; failureReasonCode: string | null; riskHold: boolean; creator: { handle: string }; attempts: Array<{ attemptNumber: number; status: string; errorCode: string | null }> }

const ACCOUNTS = ['provider_cash', 'codek_fees_pending', 'codek_fee_revenue', 'payout_clearing', 'adjustments', 'merchant_receivable', 'merchant_funding', 'creator_pending', 'creator_payable', 'creator_available', 'creator_clawback_receivable'];

function Balances() {
  const [f, setF] = useState({ ownerType: 'platform', ownerId: '' });
  const [applied, setApplied] = useState(f);
  const q = useApi<Balance[]>(`/admin/ledger/balances?ownerType=${applied.ownerType}${applied.ownerId ? `&ownerId=${applied.ownerId}` : ''}`);
  return (
    <div className="space-y-4">
      <form className="flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); setApplied(f); }}>
        <Field label="Owner type">{(p) => <Select {...p} value={f.ownerType} onChange={(e) => setF({ ...f, ownerType: e.target.value })} options={['platform', 'business', 'creator'].map((v) => ({ value: v, label: v }))} />}</Field>
        <Field label="Owner ID (business/creator)">{(p) => <Input {...p} value={f.ownerId} onChange={(e) => setF({ ...f, ownerId: e.target.value.trim() })} />}</Field>
        <Button type="submit" size="sm">Show balances</Button>
      </form>
      <QueryView query={q} empty={<EmptyState title="No balances" />}>
        {(rows) => (
          <DataTable caption="Ledger balances" rowKey={(r) => `${r.accountType}:${r.currency}:${r.ownerId ?? ''}`} rows={rows} columns={[
            { key: 'a', header: 'Account', render: (r) => r.accountType },
            { key: 'o', header: 'Owner', render: (r) => (r.ownerId ? <code className="text-xs">{r.ownerId.slice(0, 8)}</code> : 'platform') },
            { key: 'b', header: 'Balance', render: (r) => <Money minor={r.balanceMinor} currency={r.currency} /> },
          ]} />
        )}
      </QueryView>
    </div>
  );
}

function Entries() {
  const [f, setF] = useState({ referenceType: '', referenceId: '', businessId: '' });
  const [applied, setApplied] = useState(f);
  return (
    <div className="space-y-4">
      <form className="flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); setApplied(f); }}>
        <Field label="Reference type">{(p) => <Input {...p} placeholder="commission, payout, funding…" value={f.referenceType} onChange={(e) => setF({ ...f, referenceType: e.target.value })} />}</Field>
        <Field label="Reference ID">{(p) => <Input {...p} value={f.referenceId} onChange={(e) => setF({ ...f, referenceId: e.target.value.trim() })} />}</Field>
        <Field label="Business ID">{(p) => <Input {...p} value={f.businessId} onChange={(e) => setF({ ...f, businessId: e.target.value.trim() })} />}</Field>
        <Button type="submit" size="sm">Filter</Button>
      </form>
      <PagedList<Entry> key={JSON.stringify(applied)} path="/admin/ledger/entries" params={applied} empty={<EmptyState title="No entries" />}>
        {(rows) => (
          <DataTable caption="Ledger entries (append-only)" rowKey={(r) => r.id} rows={rows} columns={[
            { key: 'd', header: 'Posted', render: (r) => <DateText value={r.createdAt} withTime /> },
            { key: 't', header: 'Type', render: (r) => r.entryType },
            { key: 'r', header: 'Reference', render: (r) => <span className="text-xs">{r.referenceType} <code>{r.referenceId?.slice(0, 8)}</code></span> },
            { key: 'l', header: 'Lines', className: 'whitespace-normal', render: (r) => (
              <ul className="text-xs">{r.lines.map((l) => <li key={l.id}>{l.direction === 'debit' ? 'Dr' : 'Cr'} {l.account.accountType}{l.account.ownerId ? `:${l.account.ownerId.slice(0, 8)}` : ''} <Money minor={l.amountMinor} currency={r.currency} /></li>)}</ul>
            ) },
            { key: 'n', header: 'Description', className: 'whitespace-normal max-w-xs', render: (r) => r.description ?? '' },
          ]} />
        )}
      </PagedList>
    </div>
  );
}

function Adjustment() {
  const { run, messages } = useRunner(['/admin/actions']);
  const [f, setF] = useState({ accountType: 'adjustments', ownerId: '', currency: 'JOD', direction: 'debit', amount: '' });
  const [err, setErr] = useState<string | null>(null);
  return (
    <Card title="Manual ledger adjustment" description="Posts a balanced entry against the adjustments account. Requires a second administrator's approval. Ledger history is never edited.">
      <div className="grid gap-3 md:grid-cols-3">
        <Field label="Account">{(p) => <Select {...p} value={f.accountType} onChange={(e) => setF({ ...f, accountType: e.target.value })} options={ACCOUNTS.map((a) => ({ value: a, label: a }))} />}</Field>
        <Field label="Owner ID (for business/creator accounts)">{(p) => <Input {...p} value={f.ownerId} onChange={(e) => setF({ ...f, ownerId: e.target.value.trim() })} />}</Field>
        <Field label="Direction">{(p) => <Select {...p} value={f.direction} onChange={(e) => setF({ ...f, direction: e.target.value })} options={[{ value: 'debit', label: 'Debit' }, { value: 'credit', label: 'Credit' }]} />}</Field>
        <Field label="Currency">{(p) => <Input {...p} maxLength={3} value={f.currency} onChange={(e) => setF({ ...f, currency: e.target.value.toUpperCase() })} />}</Field>
        <Field label="Amount" error={err ?? undefined}>{(p) => <Input {...p} inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} />}</Field>
        <div className="flex items-end">
          <ReasonButton
            variant="primary"
            label="Request adjustment"
            title="Request a manual adjustment?"
            consequence="A second administrator must approve before it is posted."
            onReason={(reason) => {
              const amountMinor = toMinorUnits(f.amount, f.currency);
              if (!amountMinor) return setErr(`Enter an amount in ${f.currency}`);
              setErr(null);
              return run('/admin/ledger/adjustments', { accountType: f.accountType, ownerId: f.ownerId || null, currency: f.currency, direction: f.direction, amountMinor, reason });
            }}
          />
        </div>
      </div>
      <div className="mt-3">{messages}</div>
    </Card>
  );
}

function Fundings() {
  const [status, setStatus] = useState('pending');
  const { run, messages } = useRunner(['/admin/fundings']);
  return (
    <div className="space-y-4">
      <label className="text-sm"><span className="sr-only">Status</span><Select value={status} onChange={(e) => setStatus(e.target.value)} options={['pending', 'confirmed', 'failed', 'reversed', ''].map((s) => ({ value: s, label: s || 'All' }))} /></label>
      {messages}
      <PagedList<Funding> key={status} path="/admin/fundings" params={{ status }} empty={<EmptyState title="No fundings" />}>
        {(rows) => (
          <DataTable caption="Merchant fundings" rowKey={(r) => r.id} rows={rows} columns={[
            { key: 'd', header: 'Created', render: (r) => <DateText value={r.createdAt} withTime /> },
            { key: 'b', header: 'Business', render: (r) => r.business.displayName },
            { key: 'a', header: 'Amount', render: (r) => <Money minor={r.amountMinor} currency={r.currency} /> },
            { key: 'm', header: 'Method / reference', render: (r) => `${r.fundingMethod} ${r.providerReference ?? ''}` },
            { key: 's', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
            { key: 'x', header: '', render: (r) => r.status === 'pending' ? (
              <span className="flex gap-1">
                <ReasonButton variant="primary" label="Confirm received" title="Confirm this transfer was received?" consequence={<span>Enter the bank reference as the reason. Funds are allocated to approved commissions immediately.</span>} onReason={(providerReference) => run(`/admin/fundings/${r.id}/confirm`, { providerReference }, 'Confirmed and allocated.')} />
                <ReasonButton label="Mark failed" title="Mark as failed?" consequence="The business is notified." onReason={(reason) => run(`/admin/fundings/${r.id}/fail`, { reason }, 'Marked failed.')} />
              </span>
            ) : null },
          ]} />
        )}
      </PagedList>
    </div>
  );
}

function Payouts() {
  const [status, setStatus] = useState('');
  const { run, messages } = useRunner(['/admin/payouts']);
  return (
    <div className="space-y-4">
      <label className="text-sm"><span className="sr-only">Status</span><Select value={status} onChange={(e) => setStatus(e.target.value)} options={['', 'requested', 'processing', 'paid', 'failed', 'cancelled', 'reversed'].map((s) => ({ value: s, label: s || 'All' }))} /></label>
      {messages}
      <PagedList<Payout> key={status} path="/admin/payouts" params={{ status }} empty={<EmptyState title="No payouts" />}>
        {(rows) => (
          <DataTable caption="Payouts" rowKey={(r) => r.id} rows={rows} columns={[
            { key: 'd', header: 'Requested', render: (r) => <DateText value={r.requestedAt} withTime /> },
            { key: 'c', header: 'Creator', render: (r) => `@${r.creator.handle}` },
            { key: 'a', header: 'Amount', render: (r) => <Money minor={r.amountMinor} currency={r.currency} /> },
            { key: 'p', header: 'Provider', render: (r) => r.provider },
            { key: 's', header: 'Status', render: (r) => <StatusBadge status={r.riskHold ? 'on_hold' : r.status} /> },
            { key: 't', header: 'Attempts', render: (r) => r.attempts.map((a) => `#${a.attemptNumber} ${a.status}${a.errorCode ? ` (${a.errorCode})` : ''}`).join(', ') || '—' },
            {
              key: 'x',
              header: '',
              render: (r) =>
                ['requested', 'processing'].includes(r.status) ? (
                  <Button size="sm" variant="secondary" onClick={() => run(`/admin/payouts/${r.id}/process`, {}, 'Processing attempt run.')}>Process now</Button>
                ) : r.status === 'paid' ? (
                  <ReasonButton label="Provider returned it" title="Record a returned payout?" consequence="Use when the provider sent a completed payout back (e.g. closed account). The amount returns to the creator's available balance and the commissions become payable again. Include the provider reference in the reason. Needs a second administrator." onReason={(reason) => run(`/admin/payouts/${r.id}/returned`, { reason })} />
                ) : null,
            },
          ]} />
        )}
      </PagedList>
    </div>
  );
}

function LedgerCheck() {
  const { run, messages } = useRunner(['/admin/reconciliations', '/admin/overview']);
  const [result, setResult] = useState<unknown>(null);
  return (
    <Card title="Ledger reconciliation" description="Checks that the ledger balances, commission records and payouts agree.">
      <Button onClick={async () => setResult(await run('/admin/reconciliations/ledger', {}, 'Reconciliation completed.'))}>Run ledger reconciliation</Button>
      <div className="mt-3 space-y-2">{messages}{result != null && <JsonBlock value={result} />}</div>
      <Alert tone="info">Differences appear under Integrations &amp; webhooks → Reconciliations for resolution.</Alert>
    </Card>
  );
}

export default function Finance() {
  return (
    <div className="space-y-6">
      <PageHeader title="Ledger & payouts" description="The ledger is the financial source of truth. Entries are append-only; corrections are new entries." />
      <Tabs
        tabs={[
          { id: 'f', label: 'Fundings', content: <Fundings /> },
          { id: 'p', label: 'Payouts', content: <Payouts /> },
          { id: 'b', label: 'Balances', content: <Balances /> },
          { id: 'e', label: 'Entries', content: <Entries /> },
          { id: 'a', label: 'Adjustments', content: <Adjustment /> },
          { id: 'r', label: 'Reconciliation', content: <LedgerCheck /> },
        ]}
      />
    </div>
  );
}
