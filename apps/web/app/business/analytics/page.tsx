'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Card, DataTable, Field, Grid, Input, LoadingState, PageHeader, Stat, StatusBadge } from '@codek/ui';
import { Money } from '@/components/format';
import { QueryView } from '@/components/query-view';
import { formatRate, useApi } from '@/lib/api';
import { useSession } from '@/lib/session';

interface Provenance { source: string; metricDefinitionVersion: string; computedAt: string; note: string }
interface Overview {
  kpis: { activeCampaigns: number; activeCreators: number; clicks: number; trackedVisits: number; conversions: { total: number; verified: number; selfReported: number; unknown: number; approved: number; rejected: number; cancelled: number; refunded: number }; attribution: { attributed: number; unattributed: number; conflicted: number; invalid: number; duplicate: number } };
  money: Array<{ currency: string; totalSalesMinor: number; creatorAttributedSalesMinor: number; refundedMinor: number; creatorCommissionsMinor: number; codekFeesMinor: number }>;
  funnel: { clicks: number; trackedVisits: number; conversions: number; approvedConversions: number; conversionRate: string | null; note: string };
  ledgerCheck: { ok?: boolean; consistent?: boolean; mismatches?: unknown[] };
  provenance: Provenance;
}
interface CampaignRow { id: string; name: string; status: string; currency: string; partnerships: number; clicks: number; conversions: number; salesMinor: number; commissionMinor: number; conversionRate: string | null }
interface CreatorRow { partnershipId: string; creator: { handle: string }; campaign: { name: string }; status: string; code: string | null; clicks: number; conversions: number; currency: string | null; salesMinor: number; commissionMinor: number; conversionRate: string | null }

const dayStr = (d: Date) => d.toISOString().slice(0, 10);

export default function AnalyticsPage() {
  const { businessId } = useSession();
  const [range, setRange] = useState(() => ({ from: dayStr(new Date(Date.now() - 30 * 86400000)), to: dayStr(new Date()) }));
  const qs = `from=${encodeURIComponent(new Date(`${range.from}T00:00:00`).toISOString())}&to=${encodeURIComponent(new Date(`${range.to}T23:59:59`).toISOString())}`;
  const base = businessId ? `/businesses/${businessId}/analytics` : null;
  const overview = useApi<Overview>(base ? `${base}/overview?${qs}` : null);
  const campaigns = useApi<{ items: CampaignRow[]; provenance: Provenance }>(base ? `${base}/campaigns?${qs}` : null);
  const creators = useApi<{ items: CreatorRow[]; provenance: Provenance }>(base ? `${base}/creators?${qs}` : null);
  if (!businessId) return <LoadingState />;
  return (
    <div className="space-y-6">
      <PageHeader
        title="Analytics"
        actions={
          <div className="flex flex-wrap items-end gap-3">
            <Field label="From">{(p) => <Input {...p} type="date" value={range.from} max={range.to} onChange={(e) => setRange({ ...range, from: e.target.value })} />}</Field>
            <Field label="To">{(p) => <Input {...p} type="date" value={range.to} min={range.from} onChange={(e) => setRange({ ...range, to: e.target.value })} />}</Field>
            <a className="rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50" href={`/api/v1${base}/export.csv?kind=conversions&${qs}`}>Export sales (CSV)</a>
            <a className="rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50" href={`/api/v1${base}/export.csv?kind=creators&${qs}`}>Export creators (CSV)</a>
          </div>
        }
      />
      <QueryView query={overview}>
        {(o) => (
          <div className="space-y-4">
            <Grid cols={4}>
              <Stat label="Link clicks" value={o.funnel.clicks} />
              <Stat label="Tracked visits" value={o.funnel.trackedVisits} />
              <Stat label="Creator sales" value={o.funnel.conversions} hint={`${o.funnel.approvedConversions} approved`} />
              <Stat label="Click → sale" value={o.funnel.conversionRate ? formatRate(o.funnel.conversionRate) : '—'} />
            </Grid>
            {o.money.map((m) => (
              <Grid key={m.currency} cols={4}>
                <Stat label={`Verified sales (${m.currency})`} value={<Money minor={m.totalSalesMinor} currency={m.currency} />} hint={<>Refunded <Money minor={m.refundedMinor} currency={m.currency} /></>} />
                <Stat label="Sales from creators" value={<Money minor={m.creatorAttributedSalesMinor} currency={m.currency} />} />
                <Stat label="Creator commissions" value={<Money minor={m.creatorCommissionsMinor} currency={m.currency} />} />
                <Stat label="CODEK fees" value={<Money minor={m.codekFeesMinor} currency={m.currency} />} />
              </Grid>
            ))}
            <Card title="Data quality">
              <dl className="grid gap-3 text-sm sm:grid-cols-3 lg:grid-cols-6">
                {[
                  ['Verified', o.kpis.conversions.verified],
                  ['Self-reported', o.kpis.conversions.selfReported],
                  ['Unattributed', o.kpis.attribution.unattributed],
                  ['Conflicts', o.kpis.attribution.conflicted],
                  ['Invalid', o.kpis.attribution.invalid],
                  ['Duplicates', o.kpis.attribution.duplicate],
                ].map(([k, v]) => (
                  <div key={String(k)}><dt className="text-slate-500">{k}</dt><dd className="text-lg font-semibold">{v}</dd></div>
                ))}
              </dl>
              <p className="mt-3 text-xs text-slate-500">{o.provenance.note} {o.funnel.note} Source: {o.provenance.source}; definitions {o.provenance.metricDefinitionVersion}; computed {new Date(o.provenance.computedAt).toLocaleString()}.</p>
            </Card>
          </div>
        )}
      </QueryView>
      <Card title="By campaign">
        <QueryView query={campaigns} isEmpty={(d) => d.items.length === 0} empty={<p className="text-sm text-slate-500">No campaigns.</p>}>
          {(d) => (
            <DataTable
              caption="Campaign performance"
              rowKey={(r) => r.id}
              rows={d.items}
              columns={[
                { key: 'n', header: 'Campaign', render: (r) => <Link className="text-brand-700 hover:underline" href={`/business/campaigns/${r.id}`}>{r.name}</Link> },
                { key: 's', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
                { key: 'p', header: 'Creators', render: (r) => r.partnerships },
                { key: 'c', header: 'Clicks', render: (r) => r.clicks },
                { key: 'v', header: 'Sales', render: (r) => r.conversions },
                { key: 'r', header: 'Rate', render: (r) => (r.conversionRate ? formatRate(r.conversionRate) : '—') },
                { key: 'm', header: 'Revenue', render: (r) => <Money minor={r.salesMinor} currency={r.currency} /> },
                { key: 'k', header: 'Commission', render: (r) => <Money minor={r.commissionMinor} currency={r.currency} /> },
              ]}
            />
          )}
        </QueryView>
      </Card>
      <Card title="By creator">
        <QueryView query={creators} isEmpty={(d) => d.items.length === 0} empty={<p className="text-sm text-slate-500">No creators yet.</p>}>
          {(d) => (
            <DataTable
              caption="Creator performance"
              rowKey={(r) => r.partnershipId}
              rows={d.items}
              columns={[
                { key: 'h', header: 'Creator', render: (r) => <Link className="text-brand-700 hover:underline" href={`/business/partnerships/${r.partnershipId}`}>@{r.creator.handle}</Link> },
                { key: 'n', header: 'Campaign', render: (r) => r.campaign.name },
                { key: 'code', header: 'Code', render: (r) => <code>{r.code}</code> },
                { key: 'c', header: 'Clicks', render: (r) => r.clicks },
                { key: 'v', header: 'Sales', render: (r) => r.conversions },
                { key: 'r', header: 'Rate', render: (r) => (r.conversionRate ? formatRate(r.conversionRate) : '—') },
                { key: 'm', header: 'Revenue', render: (r) => <Money minor={r.salesMinor} currency={r.currency} /> },
                { key: 'k', header: 'Commission', render: (r) => <Money minor={r.commissionMinor} currency={r.currency} /> },
              ]}
            />
          )}
        </QueryView>
      </Card>
    </div>
  );
}
