'use client';
import Link from 'next/link';
import { ConfirmButton, DataTable, EmptyState, PageHeader, StatusBadge } from '@codek/ui';
import { DateText } from '@/components/format';
import { PagedList } from '@/components/paged';
import { api } from '@/lib/api';
import { useQueryClient } from '@tanstack/react-query';

interface Application {
  id: string;
  status: string;
  message: string | null;
  submittedAt: string;
  reviewedAt: string | null;
  rejectionReason: string | null;
  waitlistPosition: number | null;
  campaign: { id: string; name: string; status: string; business: { displayName: string } };
}

export default function CreatorApplications() {
  const qc = useQueryClient();
  const withdraw = async (id: string) => {
    await api(`/applications/${id}/withdraw`, { method: 'POST', json: {} });
    await qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith('/creator/applications') });
  };
  return (
    <div className="space-y-6">
      <PageHeader title="Applications" description="Campaigns you applied to. Accepted applications become partnerships with your own code, link and QR." />
      <PagedList<Application>
        path="/creator/applications"
        empty={<EmptyState title="No applications yet" action={<Link className="font-medium text-brand-700 underline" href="/creator/marketplace">Browse campaigns</Link>} />}
      >
        {(rows) => (
          <DataTable
            caption="Your applications"
            rowKey={(r) => r.id}
            rows={rows}
            columns={[
              { key: 'campaign', header: 'Campaign', render: (r) => <Link className="font-medium hover:underline" href={`/creator/marketplace/${r.campaign.id}`}>{r.campaign.name}</Link> },
              { key: 'business', header: 'Business', render: (r) => r.campaign.business.displayName },
              { key: 'submitted', header: 'Applied', render: (r) => <DateText value={r.submittedAt} /> },
              { key: 'status', header: 'Status', render: (r) => <span className="flex items-center gap-2"><StatusBadge status={r.status} />{r.waitlistPosition != null && r.status === 'waitlisted' && <span className="text-xs text-slate-500">#{r.waitlistPosition} on waitlist</span>}</span> },
              { key: 'note', header: 'Note', className: 'whitespace-normal max-w-xs', render: (r) => r.rejectionReason ?? (r.status === 'accepted' ? <Link className="text-brand-700 underline" href="/creator/partnerships">See partnership</Link> : '—') },
              {
                key: 'actions',
                header: '',
                render: (r) =>
                  ['pending', 'waitlisted'].includes(r.status) ? (
                    <ConfirmButton label="Withdraw" title="Withdraw application?" consequence="The business will no longer see this application. You can apply again while applications are open." confirmLabel="Withdraw" onConfirm={() => withdraw(r.id)} />
                  ) : null,
              },
            ]}
          />
        )}
      </PagedList>
    </div>
  );
}
