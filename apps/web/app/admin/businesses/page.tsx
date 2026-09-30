'use client';
import { useState } from 'react';
import { DataTable, EmptyState, Input, PageHeader, Select, StatusBadge } from '@codek/ui';
import { ReasonButton, useRunner } from '@/components/admin';
import { DateText } from '@/components/format';
import { PagedList } from '@/components/paged';

interface Biz { id: string; displayName: string; legalName: string; country: string; city: string | null; category: string; verificationStatus: string; createdAt: string; _count: { campaigns: number; partnerships: number } }

export default function AdminBusinesses() {
  const [f, setF] = useState({ q: '', verificationStatus: '' });
  const { run, messages } = useRunner(['/admin/businesses']);
  return (
    <div className="space-y-6">
      <PageHeader
        title="Businesses"
        actions={
          <div className="flex gap-2">
            <label><span className="sr-only">Search</span><Input placeholder="Name" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} /></label>
            <label><span className="sr-only">Verification</span><Select value={f.verificationStatus} onChange={(e) => setF({ ...f, verificationStatus: e.target.value })} options={['', 'unverified', 'pending', 'verified', 'rejected', 'suspended', 'expired'].map((s) => ({ value: s, label: s || 'All' }))} /></label>
          </div>
        }
      />
      {messages}
      <PagedList<Biz> key={JSON.stringify(f)} path="/admin/businesses" params={f} empty={<EmptyState title="No businesses" />}>
        {(rows) => (
          <DataTable
            caption="Businesses"
            rowKey={(r) => r.id}
            rows={rows}
            columns={[
              { key: 'n', header: 'Business', render: (r) => <span><span className="font-medium">{r.displayName}</span><br /><span className="text-xs text-slate-500">{r.legalName} · <code>{r.id.slice(0, 8)}</code></span></span> },
              { key: 'l', header: 'Location', render: (r) => [r.city, r.country].filter(Boolean).join(', ') },
              { key: 'c', header: 'Campaigns / creators', render: (r) => `${r._count.campaigns} / ${r._count.partnerships}` },
              { key: 'v', header: 'Verification', render: (r) => <StatusBadge status={r.verificationStatus} /> },
              { key: 'd', header: 'Joined', render: (r) => <DateText value={r.createdAt} /> },
              {
                key: 'a',
                header: '',
                render: (r) =>
                  r.verificationStatus === 'suspended' ? (
                    <ReasonButton variant="primary" label="Restore verification" title="Mark as verified?" consequence="The business regains its verified status." onReason={(reason) => run(`/admin/verification-status/${r.id}`, { subjectType: 'business', status: 'verified', reason }, 'Updated.')} />
                  ) : (
                    <ReasonButton label="Suspend" title={`Suspend ${r.displayName}?`} consequence="Its campaigns cannot be published while suspended." onReason={(reason) => run(`/admin/verification-status/${r.id}`, { subjectType: 'business', status: 'suspended', reason }, 'Suspended.')} />
                  ),
              },
            ]}
          />
        )}
      </PagedList>
    </div>
  );
}
