'use client';
import { useState } from 'react';
import { DataTable, EmptyState, PageHeader, Select, StatusBadge } from '@codek/ui';
import { ReasonButton, useRunner } from '@/components/admin';
import { DateText } from '@/components/format';
import { QueryView } from '@/components/query-view';
import { useApi } from '@/lib/api';

interface Req { id: string; userId: string | null; requestType: string; status: string; details: string | null; resultNote: string | null; createdAt: string; completedAt: string | null }

export default function Privacy() {
  const [status, setStatus] = useState('open');
  const q = useApi<Req[]>(`/admin/privacy/requests${status ? `?status=${status}` : ''}`);
  const { run, messages } = useRunner(['/admin/privacy']);
  return (
    <div className="space-y-6">
      <PageHeader title="Privacy requests" description="Access, correction, deletion and portability requests. Deletion anonymizes personal data via Users → Anonymize (dual approval); financial records are retained as legally required." actions={<Select value={status} onChange={(e) => setStatus(e.target.value)} options={[{ value: 'open', label: 'Open' }, { value: 'completed', label: 'Completed' }, { value: '', label: 'All' }]} />} />
      {messages}
      <QueryView query={q} empty={<EmptyState title="No requests" />}>
        {(rows) => (
          <DataTable caption="Privacy requests" rowKey={(r) => r.id} rows={rows} columns={[
            { key: 'd', header: 'Received', render: (r) => <DateText value={r.createdAt} withTime /> },
            { key: 't', header: 'Type', render: (r) => r.requestType },
            { key: 'u', header: 'User', render: (r) => <code className="text-xs">{r.userId}</code> },
            { key: 'x', header: 'Details', className: 'whitespace-normal max-w-xs', render: (r) => r.details ?? '' },
            { key: 's', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
            { key: 'n', header: 'Result', className: 'whitespace-normal max-w-xs', render: (r) => r.resultNote ?? '' },
            { key: 'a', header: '', render: (r) => (r.status !== 'completed' ? <ReasonButton variant="primary" label="Complete" title="Mark as completed?" consequence="Describe what was done (export sent, data corrected, anonymization approved)." onReason={(note) => run(`/admin/privacy/requests/${r.id}/complete`, { note }, 'Completed.')} /> : null) },
          ]} />
        )}
      </QueryView>
    </div>
  );
}
