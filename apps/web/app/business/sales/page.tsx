'use client';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Card, ConfirmButton, DataTable, EmptyState, Field, Input, LoadingState, PageHeader, Select, StatusBadge, Tabs, Textarea } from '@codek/ui';
import { DateText, Money } from '@/components/format';
import { PagedList } from '@/components/paged';
import { api, errorMessage, toMinorUnits } from '@/lib/api';
import { localToIso } from '@/lib/rates';
import { useSession } from '@/lib/session';

interface Conversion {
  id: string;
  type: string;
  status: string;
  externalRef: string | null;
  grossMinor: number | null;
  discountMinor: number | null;
  refundedMinor: number;
  currency: string | null;
  verifiedState: string;
  sourceSystem: string;
  reviewReason: string | null;
  occurredAt: string;
  partnershipId: string | null;
  commission: { status: string; commissionMinor: number; feeMinor: number; onHold: boolean } | null;
}

function ConversionTable({ businessId }: { businessId: string }) {
  const params = useSearchParams();
  const qc = useQueryClient();
  const { can } = useSession();
  const [status, setStatus] = useState('');
  const [verifiedState, setVerifiedState] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const partnershipId = params.get('partnershipId') ?? '';
  const run = async (path: string, body: Record<string, unknown>) => {
    setErr(null);
    try {
      await api(path, { method: 'POST', json: body });
      await qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).includes('/conversions') });
    } catch (e) {
      setErr(errorMessage(e));
    }
  };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <label className="text-sm"><span className="sr-only">Status</span><Select value={status} onChange={(e) => setStatus(e.target.value)} options={[['', 'All statuses'], ['attributed', 'Waiting for approval'], ['approved', 'Approved'], ['rejected', 'Rejected'], ['refunded', 'Refunded'], ['partially_refunded', 'Partially refunded'], ['cancelled', 'Cancelled']].map(([value, label]) => ({ value, label }))} /></label>
        <label className="text-sm"><span className="sr-only">Source</span><Select value={verifiedState} onChange={(e) => setVerifiedState(e.target.value)} options={[['', 'All sources'], ['verified', 'Verified (connected systems / counter)'], ['self_reported', 'Self-reported'], ['unknown', 'Unknown']].map(([value, label]) => ({ value, label }))} /></label>
        {partnershipId && <span className="self-center text-sm text-slate-500">Filtered to one partnership</span>}
      </div>
      {err && <Alert tone="error">{err}</Alert>}
      <PagedList<Conversion> key={`${status}:${verifiedState}:${partnershipId}`} path={`/businesses/${businessId}/conversions`} params={{ status, verifiedState, partnershipId }} empty={<EmptyState title="No sales yet" />}>
        {(rows) => (
          <DataTable
            caption="Sales and conversions"
            rowKey={(r) => r.id}
            rows={rows}
            columns={[
              { key: 'd', header: 'Date', render: (r) => <DateText value={r.occurredAt} withTime /> },
              { key: 'ref', header: 'Order', render: (r) => <code className="text-xs">{r.externalRef ?? '—'}</code> },
              { key: 'g', header: 'Amount', render: (r) => <Money minor={r.grossMinor} currency={r.currency} /> },
              { key: 'rf', header: 'Refunded', render: (r) => (Number(r.refundedMinor) > 0 ? <Money minor={r.refundedMinor} currency={r.currency} /> : '—') },
              { key: 's', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
              { key: 'v', header: 'Source', render: (r) => <span className="text-xs">{r.sourceSystem} · {r.verifiedState.replace('_', ' ')}</span> },
              { key: 'c', header: 'Commission', render: (r) => (r.commission ? <span className="flex items-center gap-1"><Money minor={r.commission.commissionMinor} currency={r.currency} /><StatusBadge status={r.commission.onHold ? 'on_hold' : r.commission.status} /></span> : r.partnershipId ? '—' : <span className="text-xs text-slate-500">No creator</span>) },
              {
                key: 'a',
                header: '',
                render: (r) =>
                  can('conversion.manage') && r.status === 'attributed' && r.verifiedState === 'verified' ? (
                    <span className="flex gap-1">
                      <Button size="sm" onClick={() => run(`/conversions/${r.id}/approve`, {})}>Approve</Button>
                      <ConfirmButton label="Reject" title="Reject this sale?" consequence="No commission will be paid for it. The creator can open a dispute." confirmLabel="Reject" requireReason onConfirm={(reason) => run(`/conversions/${r.id}/reject`, { reason })} />
                    </span>
                  ) : r.status === 'attributed' && r.verifiedState !== 'verified' ? (
                    <span className="text-xs text-slate-500">Reviewed by CODEK</span>
                  ) : null,
              },
            ]}
          />
        )}
      </PagedList>
    </div>
  );
}

function RecordSale({ businessId, mode }: { businessId: string; mode: 'redemption' | 'manual' }) {
  const qc = useQueryClient();
  const [f, setF] = useState({ promotionCode: '', externalRef: '', amount: '', discount: '', currency: 'JOD', occurredAt: '', conversionType: 'sale', evidenceNote: '' });
  const [msg, setMsg] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setMsg(null);
    const grossMinor = f.amount.trim() ? toMinorUnits(f.amount, f.currency) : undefined;
    const discountMinor = f.discount.trim() ? toMinorUnits(f.discount, f.currency) : undefined;
    if (grossMinor === null || discountMinor === null) return setMsg({ tone: 'error', text: `Enter amounts in ${f.currency}` });
    const body: Record<string, unknown> = { promotionCode: f.promotionCode, externalRef: f.externalRef, grossMinor, discountMinor, currency: grossMinor != null ? f.currency : undefined, occurredAt: localToIso(f.occurredAt), conversionType: f.conversionType };
    setBusy(true);
    try {
      if (mode === 'redemption') await api('/redemptions', { method: 'POST', json: { ...body, businessId } });
      else await api(`/businesses/${businessId}/conversions/manual`, { method: 'POST', json: { ...body, evidenceNote: f.evidenceNote } });
      setMsg({ tone: 'success', text: mode === 'redemption' ? 'Recorded. The creator’s commission will follow your campaign’s approval rules.' : 'Submitted for review by CODEK (self-reported).' });
      setF({ ...f, promotionCode: '', externalRef: '', amount: '', discount: '', evidenceNote: '' });
      await qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).includes('/conversions') });
    } catch (e) {
      setMsg({ tone: 'error', text: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card
      title={mode === 'redemption' ? 'Record a code at the counter' : 'Report a sale manually'}
      description={mode === 'redemption' ? 'Use this when a customer shows a creator’s code in person. Each order reference can be recorded once.' : 'For sales that no connected system reported. These are labelled self-reported and reviewed by CODEK before any commission is approved.'}
    >
      <form className="grid gap-3 md:grid-cols-2" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <Field label="Creator code" required>{(p) => <Input {...p} autoCapitalize="characters" value={f.promotionCode} onChange={(e) => setF({ ...f, promotionCode: e.target.value })} />}</Field>
        <Field label="Order / receipt number" required>{(p) => <Input {...p} value={f.externalRef} onChange={(e) => setF({ ...f, externalRef: e.target.value })} />}</Field>
        <Field label="Amount paid before discount">{(p) => <Input {...p} inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} />}</Field>
        <Field label="Discount given">{(p) => <Input {...p} inputMode="decimal" value={f.discount} onChange={(e) => setF({ ...f, discount: e.target.value })} />}</Field>
        <Field label="Currency">{(p) => <Select {...p} value={f.currency} onChange={(e) => setF({ ...f, currency: e.target.value })} options={['JOD', 'USD', 'AED', 'SAR', 'EUR'].map((c) => ({ value: c, label: c }))} />}</Field>
        <Field label="Type">{(p) => <Select {...p} value={f.conversionType} onChange={(e) => setF({ ...f, conversionType: e.target.value })} options={[{ value: 'sale', label: 'Sale' }, { value: 'booking', label: 'Booking' }, { value: 'redemption', label: 'Redemption' }]} />}</Field>
        <Field label="When (optional)" hint="Defaults to now">{(p) => <Input {...p} type="datetime-local" value={f.occurredAt} onChange={(e) => setF({ ...f, occurredAt: e.target.value })} />}</Field>
        {mode === 'manual' && <div className="md:col-span-2"><Field label="Evidence" required hint="Describe the proof (receipt, booking record). At least 10 characters.">{(p) => <Textarea {...p} rows={2} value={f.evidenceNote} onChange={(e) => setF({ ...f, evidenceNote: e.target.value })} />}</Field></div>}
        {msg && <div className="md:col-span-2"><Alert tone={msg.tone}>{msg.text}</Alert></div>}
        <div><Button type="submit" loading={busy}>{mode === 'redemption' ? 'Record redemption' : 'Submit sale'}</Button></div>
      </form>
    </Card>
  );
}

export default function BusinessSales() {
  const { businessId, can } = useSession();
  if (!businessId) return <LoadingState />;
  const tabs = [{ id: 'list', label: 'Sales', content: <Suspense><ConversionTable businessId={businessId} /></Suspense> }];
  if (can('conversion.manage')) {
    tabs.push({ id: 'counter', label: 'Record at counter', content: <RecordSale businessId={businessId} mode="redemption" /> });
    tabs.push({ id: 'manual', label: 'Report manually', content: <RecordSale businessId={businessId} mode="manual" /> });
  }
  return (
    <div className="space-y-6">
      <PageHeader title="Sales" description="Every sale reported by your systems, counter redemptions and manual reports. Customer details are never stored in full." />
      <Tabs tabs={tabs} />
    </div>
  );
}
