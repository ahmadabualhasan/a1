'use client';
import Link from 'next/link';
import { useState } from 'react';
import { DataTable, EmptyState, LoadingState, PageHeader, Select, StatusBadge } from '@codek/ui';
import { DateText } from '@/components/format';
import { PagedList } from '@/components/paged';
import { PARTNERSHIP_STATUSES } from '@/components/partnership';
import { useSession } from '@/lib/session';

interface Row { id: string; status: string; createdAt: string; campaign: { id: string; name: string }; creator: { id: string; handle: string; displayName: string }; promotionCodes: Array<{ code: string; usageCount: number; status: string }> }

export default function BusinessPartnerships() {
  const { businessId } = useSession();
  const [status, setStatus] = useState('');
  if (!businessId) return <LoadingState />;
  return (
    <div className="space-y-6">
      <PageHeader title="Partnerships" actions={<label className="text-sm"><span className="sr-only">Filter by status</span><Select value={status} onChange={(e) => setStatus(e.target.value)} options={PARTNERSHIP_STATUSES} /></label>} />
      <PagedList<Row> key={status} path={`/businesses/${businessId}/partnerships`} params={{ status }} empty={<EmptyState title="No partnerships yet" description="Accept an application or invite a creator." />}>
        {(rows) => (
          <DataTable
            caption="Partnerships"
            rowKey={(r) => r.id}
            rows={rows}
            columns={[
              { key: 'c', header: 'Creator', render: (r) => <Link className="font-medium text-brand-700 hover:underline" href={`/business/partnerships/${r.id}`}>{r.creator.displayName} <span className="text-slate-500">@{r.creator.handle}</span></Link> },
              { key: 'p', header: 'Campaign', render: (r) => r.campaign.name },
              { key: 'code', header: 'Code', render: (r) => <code>{r.promotionCodes[0]?.code}</code> },
              { key: 'u', header: 'Code uses', render: (r) => r.promotionCodes[0]?.usageCount ?? 0 },
              { key: 's', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
              { key: 'd', header: 'Since', render: (r) => <DateText value={r.createdAt} /> },
            ]}
          />
        )}
      </PagedList>
    </div>
  );
}
