'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Button, DataTable, EmptyState, PageHeader, Select, StatusBadge, Tabs } from '@codek/ui';
import { ReasonButton, useRunner } from '@/components/admin';
import { DateText } from '@/components/format';
import { PagedList } from '@/components/paged';

interface Campaign { id: string; name: string; status: string; currency: string; updatedAt: string; business: { displayName: string; verificationStatus: string }; _count: { partnerships: number; applications: number } }
interface Partnership { id: string; status: string; createdAt: string; campaign: { name: string }; business: { displayName: string }; creator: { handle: string } }

function Campaigns() {
  const [status, setStatus] = useState('pending_review');
  const { run, messages } = useRunner(['/admin/campaigns']);
  return (
    <div className="space-y-4">
      <label className="text-sm"><span className="sr-only">Status</span><Select value={status} onChange={(e) => setStatus(e.target.value)} options={['pending_review', 'published', 'active', 'paused', 'draft', 'ended', 'archived', ''].map((s) => ({ value: s, label: s ? s.replace('_', ' ') : 'All' }))} /></label>
      {messages}
      <PagedList<Campaign> key={status} path="/admin/campaigns" params={{ status }} empty={<EmptyState title="No campaigns" />}>
        {(rows) => (
          <DataTable
            caption="Campaigns"
            rowKey={(r) => r.id}
            rows={rows}
            columns={[
              { key: 'n', header: 'Campaign', render: (r) => <Link className="font-medium text-brand-700 hover:underline" href={`/campaigns/${r.id}`}>{r.name}</Link> },
              { key: 'b', header: 'Business', render: (r) => <span>{r.business.displayName} <StatusBadge status={r.business.verificationStatus} /></span> },
              { key: 's', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
              { key: 'c', header: 'Creators / applications', render: (r) => `${r._count.partnerships} / ${r._count.applications}` },
              { key: 'u', header: 'Updated', render: (r) => <DateText value={r.updatedAt} withTime /> },
              {
                key: 'a',
                header: '',
                render: (r) =>
                  r.status === 'pending_review' ? (
                    <span className="flex gap-1">
                      <Button size="sm" onClick={() => run(`/admin/campaigns/${r.id}/approve`, {}, 'Approved and published.')}>Approve</Button>
                      <ReasonButton label="Send back" title="Return to draft?" consequence="The business sees your reason and can edit and resubmit." onReason={(reason) => run(`/admin/campaigns/${r.id}/reject`, { reason }, 'Returned to draft.')} />
                    </span>
                  ) : null,
              },
            ]}
          />
        )}
      </PagedList>
    </div>
  );
}

function Partnerships() {
  const [status, setStatus] = useState('');
  return (
    <div className="space-y-4">
      <label className="text-sm"><span className="sr-only">Status</span><Select value={status} onChange={(e) => setStatus(e.target.value)} options={['', 'pending', 'active', 'paused', 'disputed', 'completed', 'terminated', 'cancelled'].map((s) => ({ value: s, label: s || 'All' }))} /></label>
      <PagedList<Partnership> key={status} path="/admin/partnerships" params={{ status }} empty={<EmptyState title="No partnerships" />}>
        {(rows) => (
          <DataTable
            caption="Partnerships"
            rowKey={(r) => r.id}
            rows={rows}
            columns={[
              { key: 'i', header: 'ID', render: (r) => <code className="text-xs">{r.id.slice(0, 8)}</code> },
              { key: 'c', header: 'Campaign', render: (r) => r.campaign.name },
              { key: 'b', header: 'Business', render: (r) => r.business.displayName },
              { key: 'cr', header: 'Creator', render: (r) => `@${r.creator.handle}` },
              { key: 's', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
              { key: 'd', header: 'Created', render: (r) => <DateText value={r.createdAt} /> },
            ]}
          />
        )}
      </PagedList>
    </div>
  );
}

export default function AdminCampaigns() {
  return (
    <div className="space-y-6">
      <PageHeader title="Campaigns & partnerships" />
      <Tabs tabs={[{ id: 'c', label: 'Campaign review', content: <Campaigns /> }, { id: 'p', label: 'Partnerships', content: <Partnerships /> }]} />
    </div>
  );
}
