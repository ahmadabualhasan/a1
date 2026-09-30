'use client';
import { useState } from 'react';
import { Alert, Button, DataTable, EmptyState, Field, Input, PageHeader } from '@codek/ui';
import { JsonBlock } from '@/components/admin';
import { DateText } from '@/components/format';
import { PagedList } from '@/components/paged';
import { api, errorMessage } from '@/lib/api';

interface Log { id: string; seq: number; actorUserId: string | null; actorType: string; tenantBusinessId: string | null; action: string; objectType: string; objectId: string | null; beforeJson: unknown; afterJson: unknown; reason: string | null; requestId: string | null; createdAt: string }

export default function Audit() {
  const [f, setF] = useState({ action: '', objectType: '', objectId: '', actorUserId: '', businessId: '' });
  const [applied, setApplied] = useState(f);
  const [chain, setChain] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const verify = async () => {
    try {
      const r = await api<{ intact: boolean; firstBrokenSeq: number | null }>('/admin/audit-logs/verify');
      setChain(r.data.intact ? { tone: 'success', text: 'Audit hash chain is intact.' } : { tone: 'error', text: `Audit chain broken at sequence ${r.data.firstBrokenSeq}. Escalate immediately.` });
    } catch (e) {
      setChain({ tone: 'error', text: errorMessage(e) });
    }
  };
  return (
    <div className="space-y-6">
      <PageHeader title="Audit log" description="Append-only and hash-chained. Every privileged and financial action is recorded." actions={<Button variant="secondary" onClick={verify}>Verify hash chain</Button>} />
      {chain && <Alert tone={chain.tone}>{chain.text}</Alert>}
      <form className="grid gap-3 md:grid-cols-6" onSubmit={(e) => { e.preventDefault(); setApplied(f); }}>
        <Field label="Action starts with">{(p) => <Input {...p} value={f.action} onChange={(e) => setF({ ...f, action: e.target.value })} placeholder="payout." />}</Field>
        <Field label="Object type">{(p) => <Input {...p} value={f.objectType} onChange={(e) => setF({ ...f, objectType: e.target.value })} />}</Field>
        <Field label="Object ID">{(p) => <Input {...p} value={f.objectId} onChange={(e) => setF({ ...f, objectId: e.target.value.trim() })} />}</Field>
        <Field label="Actor user ID">{(p) => <Input {...p} value={f.actorUserId} onChange={(e) => setF({ ...f, actorUserId: e.target.value.trim() })} />}</Field>
        <Field label="Business ID">{(p) => <Input {...p} value={f.businessId} onChange={(e) => setF({ ...f, businessId: e.target.value.trim() })} />}</Field>
        <div className="flex items-end"><Button type="submit">Filter</Button></div>
      </form>
      <PagedList<Log> key={JSON.stringify(applied)} path="/admin/audit-logs" params={applied} empty={<EmptyState title="No entries" />}>
        {(rows) => (
          <DataTable caption="Audit entries" rowKey={(r) => r.id} rows={rows} columns={[
            { key: 's', header: '#', render: (r) => String(r.seq) },
            { key: 'd', header: 'When', render: (r) => <DateText value={r.createdAt} withTime /> },
            { key: 'a', header: 'Action', render: (r) => <span className="font-medium">{r.action}</span> },
            { key: 'who', header: 'Actor', render: (r) => <span className="text-xs">{r.actorType} {r.actorUserId?.slice(0, 8)}</span> },
            { key: 'o', header: 'Object', render: (r) => <span className="text-xs">{r.objectType} {r.objectId?.slice(0, 8)}</span> },
            { key: 'r', header: 'Reason', className: 'whitespace-normal max-w-xs', render: (r) => r.reason ?? '' },
            { key: 'c', header: 'Change', render: (r) => <JsonBlock value={r.afterJson ?? r.beforeJson} /> },
          ]} />
        )}
      </PagedList>
    </div>
  );
}
