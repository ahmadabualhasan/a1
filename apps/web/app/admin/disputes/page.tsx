'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Button, Card, Checkbox, EmptyState, Field, PageHeader, Select, StatusBadge, Textarea } from '@codek/ui';
import { useRunner } from '@/components/admin';
import { DateText } from '@/components/format';
import { QueryView } from '@/components/query-view';
import { useApi } from '@/lib/api';

interface Dispute { id: string; type: string; status: string; summary: string; businessId: string | null; creatorId: string | null; partnershipId: string | null; conversionId: string | null; createdAt: string }

const NEXT: Record<string, string[]> = { open: ['evidence', 'hold', 'review', 'closed'], evidence: ['hold', 'review', 'closed'], hold: ['review', 'evidence'], review: ['decision', 'evidence'], decision: ['adjustment', 'closed'], adjustment: ['closed'], closed: [] };

function Transition({ d }: { d: Dispute }) {
  const { run, messages } = useRunner(['/admin/disputes']);
  const [f, setF] = useState({ to: '', reason: '', decisionCode: 'uphold_creator', reverseCommission: false });
  if (!NEXT[d.status]?.length) return null;
  return (
    <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); void run(`/admin/disputes/${d.id}/transition`, { to: f.to, reason: f.reason, ...(f.to === 'decision' ? { decisionCode: f.decisionCode } : {}), ...(f.to === 'adjustment' ? { reverseCommission: f.reverseCommission } : {}) }, 'Dispute updated.'); }}>
      <div className="flex flex-wrap gap-2">
        <label><span className="sr-only">Next step</span><Select value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} placeholder="Next step…" options={NEXT[d.status]!.map((s) => ({ value: s, label: s }))} /></label>
        {f.to === 'decision' && <label><span className="sr-only">Decision</span><Select value={f.decisionCode} onChange={(e) => setF({ ...f, decisionCode: e.target.value })} options={[{ value: 'uphold_creator', label: 'Uphold creator' }, { value: 'uphold_business', label: 'Uphold business' }, { value: 'partial', label: 'Partial' }]} /></label>}
        {f.to === 'adjustment' && <Checkbox label="Reverse the related commission (ledger entry)" checked={f.reverseCommission} onChange={(e) => setF({ ...f, reverseCommission: e.target.checked })} />}
      </div>
      <Field label="Reason">{(p) => <Textarea {...p} rows={2} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} />}</Field>
      <Button size="sm" type="submit" disabled={!f.to || f.reason.trim().length < 3}>Apply</Button>
      {messages}
    </form>
  );
}

export default function AdminDisputes() {
  const [status, setStatus] = useState('open');
  const q = useApi<Dispute[]>(`/admin/disputes${status ? `?status=${status}` : ''}`);
  return (
    <div className="space-y-6">
      <PageHeader title="Disputes" description="Holds pause related commissions and payouts. Adjustments are posted as new ledger entries." actions={<Select value={status} onChange={(e) => setStatus(e.target.value)} options={['open', 'evidence', 'hold', 'review', 'decision', 'adjustment', 'closed', ''].map((s) => ({ value: s, label: s || 'All' }))} />} />
      <QueryView query={q} empty={<EmptyState title="No disputes" />}>
        {(rows) => (
          <div className="space-y-4">
            {rows.map((d) => (
              <Card key={d.id} title={<Link className="hover:underline" href={`/disputes/${d.id}`}>{d.type.replace(/_/g, ' ')} · {d.id.slice(0, 8)}</Link>} description={<>Opened <DateText value={d.createdAt} withTime /></>} actions={<StatusBadge status={d.status} />}>
                <p className="whitespace-pre-wrap text-sm text-slate-700">{d.summary}</p>
                <p className="mt-2 text-xs text-slate-500">Business {d.businessId?.slice(0, 8) ?? '—'} · Creator {d.creatorId?.slice(0, 8) ?? '—'} · Partnership {d.partnershipId?.slice(0, 8) ?? '—'} · Conversion {d.conversionId?.slice(0, 8) ?? '—'}</p>
                <div className="mt-4"><Transition d={d} /></div>
              </Card>
            ))}
          </div>
        )}
      </QueryView>
    </div>
  );
}
