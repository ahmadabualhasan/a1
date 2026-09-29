'use client';
import Link from 'next/link';
import { useState } from 'react';
import { DataTable, EmptyState, LoadingState, PageHeader, Select, StatusBadge } from '@codek/ui';
import { DateText } from '@/components/format';
import { PagedList } from '@/components/paged';
import { useSession } from '@/lib/session';

interface Row { id: string; name: string; status: string; currency: string; startAt: string | null; endAt: string | null; catalogItem: { name: string }; _count: { partnerships: number; applications: number } }

const STATUSES = ['', 'draft', 'pending_review', 'published', 'active', 'paused', 'ended', 'rejected', 'archived'];

export default function CampaignsPage() {
  const { businessId, can } = useSession();
  const [status, setStatus] = useState('');
  if (!businessId) return <LoadingState />;
  return (
    <div className="space-y-6">
      <PageHeader
        title="Campaigns"
        actions={
          <div className="flex items-center gap-3">
            <label className="text-sm"><span className="sr-only">Filter by status</span><Select value={status} onChange={(e) => setStatus(e.target.value)} options={STATUSES.map((s) => ({ value: s, label: s ? s.replace('_', ' ') : 'All statuses' }))} /></label>
            {can('campaign.manage') && <Link className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700" href="/business/campaigns/new">New campaign</Link>}
          </div>
        }
      />
      <PagedList<Row> key={status} path={`/businesses/${businessId}/campaigns`} params={{ status }} empty={<EmptyState title="No campaigns yet" description="Create a campaign to start working with creators." />}>
        {(rows) => (
          <DataTable
            caption="Campaigns"
            rowKey={(r) => r.id}
            rows={rows}
            columns={[
              { key: 'n', header: 'Campaign', render: (r) => <Link className="font-medium text-brand-700 hover:underline" href={`/business/campaigns/${r.id}`}>{r.name}</Link> },
              { key: 'i', header: 'Product / service', render: (r) => r.catalogItem.name },
              { key: 's', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
              { key: 'p', header: 'Creators', render: (r) => r._count.partnerships },
              { key: 'a', header: 'Pending applications', render: (r) => (r._count.applications ? <Link className="text-brand-700 underline" href={`/business/applications?campaignId=${r.id}`}>{r._count.applications}</Link> : 0) },
              { key: 'd', header: 'Dates', render: (r) => <><DateText value={r.startAt} /> – <DateText value={r.endAt} /></> },
            ]}
          />
        )}
      </PagedList>
    </div>
  );
}
