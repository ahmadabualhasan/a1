'use client';
import Link from 'next/link';
import { DataTable, EmptyState, PageHeader, StatusBadge } from '@codek/ui';
import { DateText, Money } from '@/components/format';
import { PagedList } from '@/components/paged';

interface Sale {
  id: string;
  type: string;
  status: string;
  currency: string | null;
  commissionableMinor: number | string | null;
  refundedMinor: number | string;
  verifiedState: string;
  occurredAt: string;
  partnershipId: string | null;
  commission: { status: string; commissionMinor: number | string; reversedMinor: number | string; clawbackMinor: number | string; holdUntil: string | null; onHold: boolean } | null;
}

const VERIFIED: Record<string, string> = { verified: 'Confirmed by the business system', self_reported: 'Reported by the business', unknown: 'Not yet confirmed' };

export default function CreatorSales() {
  return (
    <div className="space-y-6">
      <PageHeader title="Sales" description="Purchases attributed to your code or link. Customer details are never shown." />
      <PagedList<Sale> path="/creator/sales" empty={<EmptyState title="No sales yet" description="Sales appear here once customers use your code or link." />}>
        {(rows) => (
          <DataTable
            caption="Your attributed sales"
            rowKey={(r) => r.id}
            rows={rows}
            columns={[
              { key: 'date', header: 'Date', render: (r) => <DateText value={r.occurredAt} /> },
              { key: 'type', header: 'Type', render: (r) => r.type.replace(/_/g, ' ') },
              { key: 'amount', header: 'Commission base', render: (r) => <Money minor={r.commissionableMinor} currency={r.currency} /> },
              { key: 'refund', header: 'Refunded', render: (r) => (Number(r.refundedMinor) > 0 ? <Money minor={r.refundedMinor} currency={r.currency} /> : '—') },
              { key: 'status', header: 'Sale status', render: (r) => <StatusBadge status={r.status} /> },
              { key: 'source', header: 'Confirmation', render: (r) => <span className="text-xs">{VERIFIED[r.verifiedState] ?? r.verifiedState}</span> },
              {
                key: 'commission',
                header: 'Your commission',
                render: (r) =>
                  r.commission ? (
                    <span className="flex items-center gap-2">
                      <Money minor={r.commission.commissionMinor} currency={r.currency} />
                      {(Number(r.commission.reversedMinor) > 0 || Number(r.commission.clawbackMinor) > 0) && (
                        <span className="text-xs text-amber-700">
                          reduced by <Money minor={r.commission.reversedMinor} currency={r.currency} />{Number(r.commission.clawbackMinor) > 0 && <> + clawback <Money minor={r.commission.clawbackMinor} currency={r.currency} /></>}
                        </span>
                      )}
                      <StatusBadge status={r.commission.onHold ? 'on_hold' : r.commission.status} />
                    </span>
                  ) : (
                    '—'
                  ),
              },
              { key: 'p', header: '', render: (r) => (r.partnershipId ? <Link className="text-xs text-brand-700 underline" href={`/creator/partnerships/${r.partnershipId}`}>Partnership</Link> : null) },
            ]}
          />
        )}
      </PagedList>
      <p className="text-xs text-slate-500">Commission amounts are calculated by CODEK from your saved partnership terms. Refunds and cancellations can reduce them according to those terms.</p>
    </div>
  );
}
