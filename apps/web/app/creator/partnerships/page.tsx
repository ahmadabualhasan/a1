'use client';
import Link from 'next/link';
import { useState } from 'react';
import { DataTable, EmptyState, PageHeader, Select, StatusBadge } from '@codek/ui';
import { DateText } from '@/components/format';
import { PagedList } from '@/components/paged';
import { PARTNERSHIP_STATUSES } from '@/components/partnership';

interface Row { id: string; status: string; createdAt: string; campaign: { id: string; name: string; endAt: string | null }; business: { displayName: string }; promotionCodes: Array<{ code: string; usageCount: number }> }


export default function CreatorPartnerships() {
  const [status, setStatus] = useState('');
  return (
    <div className="space-y-6">
      <PageHeader
        title="Partnerships"
        description="Each partnership has its own saved terms, code, link and QR."
        actions={<label className="text-sm"><span className="sr-only">Filter by status</span><Select value={status} onChange={(e) => setStatus(e.target.value)} options={PARTNERSHIP_STATUSES} /></label>}
      />
      <PagedList<Row> key={status} path="/creator/partnerships" params={{ status }} empty={<EmptyState title="No partnerships" description="Apply to campaigns or accept an invitation to start one." />}>
        {(rows) => (
          <DataTable
            caption="Your partnerships"
            rowKey={(r) => r.id}
            rows={rows}
            columns={[
              { key: 'campaign', header: 'Campaign', render: (r) => <Link className="font-medium text-brand-700 hover:underline" href={`/creator/partnerships/${r.id}`}>{r.campaign.name}</Link> },
              { key: 'business', header: 'Business', render: (r) => r.business.displayName },
              { key: 'code', header: 'Code', render: (r) => <code className="rounded bg-slate-100 px-2 py-0.5">{r.promotionCodes[0]?.code ?? '—'}</code> },
              { key: 'uses', header: 'Code uses', render: (r) => r.promotionCodes[0]?.usageCount ?? 0 },
              { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
              { key: 'ends', header: 'Campaign ends', render: (r) => <DateText value={r.campaign.endAt} /> },
            ]}
          />
        )}
      </PagedList>
    </div>
  );
}
