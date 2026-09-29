'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { Alert, Button, Card, DataTable, EmptyState, Field, PageHeader, Select, StatusBadge, Textarea } from '@codek/ui';
import { DateText } from '@/components/format';
import { DISPUTE_TYPES, RoleShell } from '@/components/navs';
import { QueryView } from '@/components/query-view';
import { errorMessage, useApi, useApiMutation } from '@/lib/api';

interface Dispute { id: string; type: string; status: string; summary: string; partnershipId: string | null; conversionId: string | null; createdAt: string; closedAt: string | null }


function OpenDispute() {
  const params = useSearchParams();
  const [f, setF] = useState({ type: 'attribution', summary: '', partnershipId: params.get('partnershipId') ?? '', conversionId: params.get('conversionId') ?? '' });
  const [done, setDone] = useState<string | null>(null);
  const open = useApiMutation<Record<string, unknown>, { id: string }>('POST', '/disputes', { invalidate: ['/disputes'], onSuccess: (d) => setDone(d.id) });
  return (
    <Card title="Open a dispute" description="Our team reviews every dispute. Related commissions may be held while it is reviewed.">
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); open.mutate({ type: f.type, summary: f.summary, partnershipId: f.partnershipId || undefined, conversionId: f.conversionId || undefined }); }}>
        <Field label="What is the problem?">{(p) => <Select {...p} value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })} options={DISPUTE_TYPES} />}</Field>
        <Field label="Describe what happened" required hint="At least 10 characters. Include order references and dates if you have them.">{(p) => <Textarea {...p} rows={4} minLength={10} maxLength={4000} value={f.summary} onChange={(e) => setF({ ...f, summary: e.target.value })} />}</Field>
        {f.partnershipId && <p className="text-xs text-slate-500">Linked partnership: {f.partnershipId.slice(0, 8)}</p>}
        {f.conversionId && <p className="text-xs text-slate-500">Linked sale: {f.conversionId.slice(0, 8)}</p>}
        {open.error && <Alert tone="error">{errorMessage(open.error)}</Alert>}
        {done && <Alert tone="success">Dispute opened. <Link className="underline" href={`/disputes/${done}`}>View it</Link>.</Alert>}
        <Button type="submit" loading={open.isPending}>Open dispute</Button>
      </form>
    </Card>
  );
}

function DisputeList() {
  const q = useApi<Dispute[]>('/disputes');
  return (
    <QueryView query={q} empty={<EmptyState title="No disputes" />}>
      {(rows) => (
        <DataTable
          caption="Your disputes"
          rowKey={(r) => r.id}
          rows={rows}
          columns={[
            { key: 'd', header: 'Opened', render: (r) => <DateText value={r.createdAt} /> },
            { key: 't', header: 'Type', render: (r) => DISPUTE_TYPES.find((t) => t.value === r.type)?.label ?? r.type },
            { key: 's', header: 'Summary', className: 'whitespace-normal max-w-md', render: (r) => <Link className="hover:underline" href={`/disputes/${r.id}`}>{r.summary.slice(0, 120)}</Link> },
            { key: 'st', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
          ]}
        />
      )}
    </QueryView>
  );
}

export default function DisputesPage() {
  return (
    <RoleShell>
      <div className="space-y-6">
        <PageHeader title="Disputes" description="Disagreements about sales, commissions, refunds, content or payments." />
        <div className="grid gap-6 xl:grid-cols-3">
          <div className="xl:col-span-2"><DisputeList /></div>
          <Suspense><OpenDispute /></Suspense>
        </div>
      </div>
    </RoleShell>
  );
}
