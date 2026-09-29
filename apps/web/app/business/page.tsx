'use client';
import Link from 'next/link';
import { Alert, Card, Grid, LoadingState, PageHeader, Stat } from '@codek/ui';
import { Money } from '@/components/format';
import { useApi } from '@/lib/api';
import { useSession } from '@/lib/session';

interface Overview {
  kpis: { activeCampaigns: number; activeCreators: number; clicks: number; trackedVisits: number; conversions: { total: number; verified: number; selfReported: number; approved: number }; attribution: { attributed: number; unattributed: number; conflicted: number } };
  money: Array<{ currency: string; totalSalesMinor: number; creatorAttributedSalesMinor: number; refundedMinor: number; creatorCommissionsMinor: number; codekFeesMinor: number }>;
  ledgerCheck: { consistent: boolean };
  provenance: { note: string; metricDefinitionVersion: string };
}
interface Business { id: string; displayName: string; verificationStatus: string; websiteUrl: string | null }
interface Funding { balances: Array<{ currency: string; fundingBalanceMinor: number; shortfallMinor: number; approvedUnfundedCount: number }> }

export default function BusinessDashboard() {
  const { businessId, can } = useSession();
  const b = useApi<Business>(businessId ? `/businesses/${businessId}` : null);
  const o = useApi<Overview>(businessId && can('analytics.read') ? `/businesses/${businessId}/analytics/overview` : null);
  const funding = useApi<Funding>(businessId && can('funding.read') ? `/businesses/${businessId}/funding` : null);
  const pendingApps = useApi<unknown[]>(businessId && can('application.review') ? `/businesses/${businessId}/applications?status=pending&limit=1` : null);
  const catalog = useApi<unknown[]>(businessId ? `/businesses/${businessId}/catalog?limit=1` : null);
  const campaigns = useApi<unknown[]>(businessId ? `/businesses/${businessId}/campaigns?limit=1` : null);
  const integrations = useApi<unknown[]>(businessId ? `/integrations?businessId=${businessId}` : null);
  if (!businessId || b.isLoading) return <LoadingState />;
  const steps: Array<{ href: string; text: string }> = [];
  if (b.data?.data.verificationStatus === 'unverified') steps.push({ href: '/business/settings', text: 'Request business verification' });
  if (catalog.data && !catalog.data.meta.pagination?.total) steps.push({ href: '/business/catalog', text: 'Add the product or service creators will promote' });
  if (campaigns.data && !campaigns.data.meta.pagination?.total) steps.push({ href: '/business/campaigns/new', text: 'Create your first campaign' });
  if (integrations.data && !integrations.data.data.length) steps.push({ href: '/business/integrations', text: 'Connect your store or booking system (optional — you can also record sales by code)' });
  const pending = pendingApps.data?.meta.pagination?.total ?? 0;
  if (pending) steps.push({ href: '/business/applications', text: `Review ${pending} creator application${pending > 1 ? 's' : ''}` });
  const short = funding.data?.data.balances.filter((x) => Number(x.shortfallMinor) > 0) ?? [];
  return (
    <div className="space-y-8">
      <PageHeader title={b.data?.data.displayName ?? 'Dashboard'} description="Last 30 days." actions={<Link className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700" href="/business/campaigns/new">New campaign</Link>} />
      {steps.length > 0 && (
        <Alert tone="info">
          <p className="font-medium">Next steps</p>
          <ul className="mt-1 list-disc pl-5">{steps.map((s) => <li key={s.text}><Link className="underline" href={s.href}>{s.text}</Link></li>)}</ul>
        </Alert>
      )}
      {short.map((s) => (
        <Alert key={s.currency} tone="warning">
          {s.approvedUnfundedCount} approved commission{s.approvedUnfundedCount === 1 ? ' is' : 's are'} waiting for funding — add <Money minor={s.shortfallMinor} currency={s.currency} /> so creators can be paid. <Link className="underline" href="/business/funding">Add funding</Link>
        </Alert>
      ))}
      {o.data && (
        <>
          <Grid cols={4}>
            <Stat label="Active campaigns" value={o.data.data.kpis.activeCampaigns} />
            <Stat label="Active creators" value={o.data.data.kpis.activeCreators} />
            <Stat label="Link clicks" value={o.data.data.kpis.clicks} />
            <Stat label="Creator sales" value={o.data.data.kpis.attribution.attributed} hint={`${o.data.data.kpis.conversions.approved} approved`} />
          </Grid>
          {o.data.data.money.map((m) => (
            <Grid key={m.currency} cols={4}>
              <Stat label={`Verified sales (${m.currency})`} value={<Money minor={m.totalSalesMinor} currency={m.currency} />} />
              <Stat label="From creators" value={<Money minor={m.creatorAttributedSalesMinor} currency={m.currency} />} />
              <Stat label="Creator commissions" value={<Money minor={m.creatorCommissionsMinor} currency={m.currency} />} />
              <Stat label="CODEK fees" value={<Money minor={m.codekFeesMinor} currency={m.currency} />} />
            </Grid>
          ))}
          <Card>
            <p className="text-xs text-slate-500">
              {o.data.data.provenance.note} Self-reported sales: {o.data.data.kpis.conversions.selfReported}. Unattributed: {o.data.data.kpis.attribution.unattributed}. Conflicts: {o.data.data.kpis.attribution.conflicted}.{' '}
              <Link className="underline" href="/business/analytics">Full analytics</Link>
            </p>
          </Card>
        </>
      )}
    </div>
  );
}
