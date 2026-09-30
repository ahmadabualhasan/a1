'use client';
import { useState } from 'react';
import { Button, DataTable, EmptyState, PageHeader, Select, StatusBadge } from '@codek/ui';
import { JsonBlock, ReasonButton, useRunner } from '@/components/admin';
import { DateText } from '@/components/format';
import { QueryView } from '@/components/query-view';
import { useApi } from '@/lib/api';
import { useSession } from '@/lib/session';

interface Action { id: string; adminUserId: string; actionType: string; targetType: string; targetId: string; reason: string; payloadJson: unknown; approvalState: string; approvedBy: string | null; decidedAt: string | null; executedAt: string | null; resultJson: unknown; createdAt: string }

export default function Approvals() {
  const { session } = useSession();
  const [state, setState] = useState('pending');
  const q = useApi<Action[]>(`/admin/actions${state ? `?state=${state}` : ''}`);
  const { run, messages } = useRunner(['/admin']);
  return (
    <div className="space-y-6">
      <PageHeader title="Dual approvals" description="Sensitive actions (manual ledger adjustments, reversals, re-attribution, role grants, anonymization) need a second administrator. You cannot approve your own request." actions={<Select value={state} onChange={(e) => setState(e.target.value)} options={[{ value: 'pending', label: 'Pending' }, { value: 'approved', label: 'Approved' }, { value: 'rejected', label: 'Rejected' }, { value: '', label: 'All' }]} />} />
      {messages}
      <QueryView query={q} empty={<EmptyState title="Nothing waiting" />}>
        {(rows) => (
          <DataTable
            caption="Admin actions"
            rowKey={(r) => r.id}
            rows={rows}
            columns={[
              { key: 'd', header: 'Requested', render: (r) => <DateText value={r.createdAt} withTime /> },
              { key: 't', header: 'Action', render: (r) => <span className="font-medium">{r.actionType}</span> },
              { key: 'g', header: 'Target', render: (r) => <code className="text-xs">{r.targetType}:{r.targetId.slice(0, 8)}</code> },
              { key: 'r', header: 'Reason', className: 'whitespace-normal max-w-xs', render: (r) => r.reason },
              { key: 'p', header: 'Details', render: (r) => <JsonBlock value={r.payloadJson} /> },
              { key: 's', header: 'State', render: (r) => <StatusBadge status={r.approvalState} /> },
              {
                key: 'a',
                header: '',
                render: (r) =>
                  r.approvalState === 'pending' ? (
                    r.adminUserId === session?.user.id ? (
                      <span className="text-xs text-slate-500">Your request</span>
                    ) : (
                      <span className="flex gap-1">
                        <Button size="sm" onClick={() => run(`/admin/actions/${r.id}/approve`, {}, 'Approved and executed.')}>Approve</Button>
                        <ReasonButton label="Reject" title="Reject this action?" consequence="The action will not be executed." onReason={(reason) => run(`/admin/actions/${r.id}/reject`, { reason }, 'Rejected.')} />
                      </span>
                    )
                  ) : r.resultJson ? <JsonBlock value={r.resultJson} /> : null,
              },
            ]}
          />
        )}
      </QueryView>
    </div>
  );
}
