'use client';
import { useState } from 'react';
import { Checkbox, DataTable, EmptyState, PageHeader, Select, StatusBadge } from '@codek/ui';
import { ReasonButton, useRunner } from '@/components/admin';
import { DateText, Money } from '@/components/format';
import { PagedList } from '@/components/paged';

interface Conversion { id: string; businessId: string; partnershipId: string | null; type: string; status: string; externalRef: string | null; grossMinor: number | null; currency: string | null; verifiedState: string; sourceSystem: string; reviewReason: string | null; occurredAt: string; commission: { id: string; status: string; commissionMinor: number; onHold: boolean } | null }

export default function AdminConversions() {
  const [f, setF] = useState({ status: '', verifiedState: '', needsReview: true });
  const [target, setTarget] = useState('');
  const { run, messages } = useRunner(['/admin/conversions', '/admin/actions']);
  return (
    <div className="space-y-6">
      <PageHeader
        title="Conversions"
        description="Self-reported sales and flagged conversions need operations review. Reversals and re-attribution need a second administrator."
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <Checkbox label="Needs review" checked={f.needsReview} onChange={(e) => setF({ ...f, needsReview: e.target.checked })} />
            <label><span className="sr-only">Status</span><Select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })} options={['', 'attributed', 'approved', 'rejected', 'refunded', 'partially_refunded', 'reversed', 'cancelled'].map((s) => ({ value: s, label: s || 'All statuses' }))} /></label>
            <label><span className="sr-only">Source</span><Select value={f.verifiedState} onChange={(e) => setF({ ...f, verifiedState: e.target.value })} options={['', 'verified', 'self_reported', 'unknown'].map((s) => ({ value: s, label: s || 'All sources' }))} /></label>
          </div>
        }
      />
      {messages}
      <PagedList<Conversion> key={JSON.stringify(f)} path="/admin/conversions" params={{ status: f.status, verifiedState: f.verifiedState, needsReview: f.needsReview ? 'true' : undefined }} empty={<EmptyState title="Nothing to review" />}>
        {(rows) => (
          <DataTable
            caption="Conversions"
            rowKey={(r) => r.id}
            rows={rows}
            columns={[
              { key: 'd', header: 'Occurred', render: (r) => <DateText value={r.occurredAt} withTime /> },
              { key: 'i', header: 'ID / order', render: (r) => <span className="text-xs"><code>{r.id.slice(0, 8)}</code><br />{r.externalRef}</span> },
              { key: 'a', header: 'Amount', render: (r) => <Money minor={r.grossMinor} currency={r.currency} /> },
              { key: 's', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
              { key: 'v', header: 'Source', render: (r) => <span className="text-xs">{r.sourceSystem} · {r.verifiedState}</span> },
              { key: 'r', header: 'Review reason', className: 'whitespace-normal max-w-xs', render: (r) => r.reviewReason ?? '' },
              { key: 'c', header: 'Commission', render: (r) => (r.commission ? <span><Money minor={r.commission.commissionMinor} currency={r.currency} /> <StatusBadge status={r.commission.onHold ? 'on_hold' : r.commission.status} /></span> : '—') },
              {
                key: 'x',
                header: '',
                render: (r) => (
                  <span className="flex flex-wrap gap-1">
                    {r.status === 'attributed' && <ReasonButton variant="primary" label="Approve" title="Approve this conversion?" consequence="Commission becomes approved and payable once funded and after the hold period." onReason={(reason) => run(`/admin/conversions/${r.id}/approve`, { reason }, 'Approved.')} />}
                    {r.commission && !['reversed', 'paid'].includes(r.commission.status) && <ReasonButton label="Reverse commission" title="Reverse this commission?" consequence="Posts a reversing ledger entry. Needs a second administrator." onReason={(reason) => run(`/admin/commissions/${r.commission!.id}/reverse`, { reason })} />}
                    <ReasonButton
                      variant="secondary"
                      label="Re-attribute"
                      title="Re-attribute to another partnership?"
                      consequence={<span>Target partnership ID: <input aria-label="Target partnership ID" className="w-full rounded border px-2 py-1 font-mono text-xs" value={target} onChange={(e) => setTarget(e.target.value.trim())} /> Needs a second administrator; the original decision is kept.</span>}
                      onReason={(reason) => run(`/admin/conversions/${r.id}/reattribute`, { partnershipId: target, reason })}
                    />
                  </span>
                ),
              },
            ]}
          />
        )}
      </PagedList>
    </div>
  );
}
