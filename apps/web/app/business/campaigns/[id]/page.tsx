'use client';
import Link from 'next/link';
import { use, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Card, ConfirmButton, DataTable, DescriptionList, PageHeader, StatusBadge, Tabs } from '@codek/ui';
import { CampaignDetailView, commissionText, discountText } from '@/components/campaigns';
import type { MemberCampaign } from '@/components/campaign-form';
import { DateText } from '@/components/format';
import { PagedList } from '@/components/paged';
import { QueryView } from '@/components/query-view';
import { api, errorMessage, useApi } from '@/lib/api';
import { useSession } from '@/lib/session';

interface PartnershipRow { id: string; status: string; creator: { handle: string; displayName: string }; promotionCodes: Array<{ code: string; usageCount: number }>; createdAt: string }

function Lifecycle({ c }: { c: MemberCampaign }) {
  const qc = useQueryClient();
  const { can } = useSession();
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  if (!can('campaign.manage')) return null;
  const act = async (action: string, ok: string) => {
    setError(null);
    setInfo(null);
    try {
      const r = await api<{ status: string }>(`/campaigns/${c.id}/${action}`, { method: 'POST', json: {} });
      setInfo(r.data.status === 'pending_review' ? 'Submitted for review. You will be notified when it is approved.' : ok);
      await qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).includes('/campaigns') });
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  const s = c.status;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {['draft', 'pending_review', 'published', 'active', 'paused'].includes(s) && <Link className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-50" href={`/business/campaigns/${c.id}/edit`}>Edit</Link>}
        {s === 'draft' && <Button size="sm" onClick={() => act('publish', 'Published.')}>Publish</Button>}
        {['published', 'active'].includes(s) && <ConfirmButton variant="secondary" label="Pause" title="Pause this campaign?" consequence="New applications stop and creator codes stop earning commission until you resume." confirmLabel="Pause" onConfirm={() => act('pause', 'Paused.')} />}
        {s === 'paused' && <Button size="sm" onClick={() => act('resume', 'Resumed.')}>Resume</Button>}
        {['published', 'active', 'paused'].includes(s) && <ConfirmButton label="End campaign" title="End this campaign?" consequence="All partnerships complete and codes and links stop working. Commissions already earned stay payable. This cannot be undone." confirmLabel="End campaign" onConfirm={() => act('end', 'Ended.')} />}
        {['draft', 'ended'].includes(s) && <ConfirmButton variant="secondary" label="Archive" title="Archive this campaign?" consequence="It will be hidden from your active lists. Records are kept." confirmLabel="Archive" onConfirm={() => act('archive', 'Archived.')} />}
      </div>
      {s === 'pending_review' && <Alert tone="info">This campaign is waiting for review by CODEK.</Alert>}
      {error && <Alert tone="error">{error}</Alert>}
      {info && <Alert tone="success">{info}</Alert>}
    </div>
  );
}

export default function BusinessCampaign({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const q = useApi<MemberCampaign>(`/campaigns/${id}`);
  return (
    <div className="space-y-6">
      <Link href="/business/campaigns" className="text-sm text-brand-700 underline">← All campaigns</Link>
      <QueryView query={q}>
        {(c) => (
          <>
            <PageHeader title={c.name} description={`${c.catalogItem.name} · ${c.currency}`} actions={<StatusBadge status={c.status} />} />
            <Lifecycle c={c} />
            <Tabs
              tabs={[
                {
                  id: 'summary',
                  label: 'Summary',
                  content: (
                    <div className="grid gap-6 lg:grid-cols-2">
                      <Card title="Terms">
                        <DescriptionList
                          items={[
                            { label: 'Creator commission', value: commissionText(c.commissionTerms, c.currency) },
                            { label: 'Customer offer', value: c.customerDiscount ? discountText(c.customerDiscount, c.currency) : 'None' },
                            { label: 'Hold period', value: `${c.holdPeriodDays} days` },
                            { label: 'Sales approval', value: c.conversionApprovalMode === 'auto_verified' ? 'Automatic for connected systems' : 'Manual' },
                            { label: 'Attribution', value: `${c.attribution.model.replace('_', ' ')} · ${c.attribution.windowDays} days` },
                            { label: 'Terms version', value: `v${c.configVersion}` },
                          ]}
                        />
                      </Card>
                      <Card title="Participation">
                        <DescriptionList
                          items={[
                            { label: 'Creators', value: c.participantCap != null ? `${c.participantCap - (c.spotsLeft ?? 0)} of ${c.participantCap}` : 'No limit' },
                            { label: 'Applications', value: c.applicationsOpen ? 'Open' : 'Closed' },
                            { label: 'Deadline', value: <DateText value={c.applicationDeadlineAt} withTime /> },
                            { label: 'Runs', value: <><DateText value={c.startAt} /> – <DateText value={c.endAt} /></> },
                            { label: 'Customer link', value: c.destinationUrl ?? '—' },
                          ]}
                        />
                        <Link className="mt-3 inline-block text-sm text-brand-700 underline" href={`/business/applications?campaignId=${c.id}`}>Review applications</Link>
                      </Card>
                    </div>
                  ),
                },
                {
                  id: 'creators',
                  label: 'Creators',
                  content: (
                    <PagedList<PartnershipRow> path={`/businesses/${c.business.id}/partnerships`} params={{ campaignId: c.id }} empty={<p className="text-sm text-slate-500">No creators yet.</p>}>
                      {(rows) => (
                        <DataTable
                          caption="Creators in this campaign"
                          rowKey={(r) => r.id}
                          rows={rows}
                          columns={[
                            { key: 'c', header: 'Creator', render: (r) => <Link className="font-medium text-brand-700 hover:underline" href={`/business/partnerships/${r.id}`}>@{r.creator.handle}</Link> },
                            { key: 'code', header: 'Code', render: (r) => <code>{r.promotionCodes[0]?.code}</code> },
                            { key: 'u', header: 'Uses', render: (r) => r.promotionCodes[0]?.usageCount ?? 0 },
                            { key: 's', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
                            { key: 'd', header: 'Since', render: (r) => <DateText value={r.createdAt} /> },
                          ]}
                        />
                      )}
                    </PagedList>
                  ),
                },
                { id: 'preview', label: 'Creator view', content: <CampaignDetailView id={c.id} /> },
              ]}
            />
          </>
        )}
      </QueryView>
    </div>
  );
}
