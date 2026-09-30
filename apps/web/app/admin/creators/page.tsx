'use client';
import { useState } from 'react';
import { Badge, DataTable, EmptyState, Input, PageHeader, Select, StatusBadge } from '@codek/ui';
import { ReasonButton, useRunner } from '@/components/admin';
import { DateText } from '@/components/format';
import { PagedList } from '@/components/paged';

interface Creator { id: string; handle: string; displayName: string; country: string | null; verificationStatus: string; payoutReadiness: string; createdAt: string; socialAccounts: Array<{ id: string; platform: string; followerCount: number | null; verificationState: string }>; _count: { partnerships: number } }

export default function AdminCreators() {
  const [f, setF] = useState({ q: '', verificationStatus: '' });
  const { run, messages } = useRunner(['/admin/creators']);
  return (
    <div className="space-y-6">
      <PageHeader
        title="Creators"
        actions={
          <div className="flex gap-2">
            <label><span className="sr-only">Search</span><Input placeholder="Name or handle" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} /></label>
            <label><span className="sr-only">Verification</span><Select value={f.verificationStatus} onChange={(e) => setF({ ...f, verificationStatus: e.target.value })} options={['', 'unverified', 'pending', 'verified', 'rejected', 'suspended', 'expired'].map((s) => ({ value: s, label: s || 'All' }))} /></label>
          </div>
        }
      />
      {messages}
      <PagedList<Creator> key={JSON.stringify(f)} path="/admin/creators" params={f} empty={<EmptyState title="No creators" />}>
        {(rows) => (
          <DataTable
            caption="Creators"
            rowKey={(r) => r.id}
            rows={rows}
            columns={[
              { key: 'n', header: 'Creator', render: (r) => <span><span className="font-medium">{r.displayName}</span><br /><span className="text-xs text-slate-500">@{r.handle} · <code>{r.id.slice(0, 8)}</code></span></span> },
              { key: 's', header: 'Social (account ID)', className: 'whitespace-normal', render: (r) => <span className="flex flex-wrap gap-1">{r.socialAccounts.map((s) => <Badge key={s.id} tone={s.verificationState === 'verified' ? 'green' : 'gray'}>{s.platform} {s.followerCount?.toLocaleString() ?? ''} · {s.id.slice(0, 8)}</Badge>)}</span> },
              { key: 'p', header: 'Partnerships', render: (r) => r._count.partnerships },
              { key: 'r', header: 'Payouts', render: (r) => <StatusBadge status={r.payoutReadiness} /> },
              { key: 'v', header: 'Verification', render: (r) => <StatusBadge status={r.verificationStatus} /> },
              { key: 'd', header: 'Joined', render: (r) => <DateText value={r.createdAt} /> },
              {
                key: 'a',
                header: '',
                render: (r) =>
                  r.verificationStatus === 'suspended' ? (
                    <ReasonButton variant="primary" label="Restore" title="Restore verified status?" consequence="The creator regains verified status." onReason={(reason) => run(`/admin/verification-status/${r.id}`, { subjectType: 'creator', status: 'verified', reason }, 'Updated.')} />
                  ) : (
                    <ReasonButton label="Suspend" title={`Suspend @${r.handle}?`} consequence="They cannot join verified-only campaigns while suspended." onReason={(reason) => run(`/admin/verification-status/${r.id}`, { subjectType: 'creator', status: 'suspended', reason }, 'Suspended.')} />
                  ),
              },
            ]}
          />
        )}
      </PagedList>
    </div>
  );
}
