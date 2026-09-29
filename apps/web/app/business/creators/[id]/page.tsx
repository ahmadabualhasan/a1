'use client';
import Link from 'next/link';
import { use, useState } from 'react';
import { Alert, Badge, Button, Card, DataTable, DescriptionList, Field, Input, LoadingState, PageHeader, Select, Textarea } from '@codek/ui';
import { Money } from '@/components/format';
import { QueryView } from '@/components/query-view';
import { errorMessage, formatRate, useApi, useApiMutation } from '@/lib/api';
import { useSession } from '@/lib/session';

interface CreatorDetail {
  id: string;
  handle: string;
  displayName: string;
  bio: string | null;
  city: string | null;
  country: string | null;
  languages: string[];
  categories: string[];
  portfolioUrls: string[];
  verificationStatus: string;
  socialAccounts: Array<{ id: string; platform: string; handle: string; profileUrl: string | null; followerCount: number | null; averageViews: number | null; engagementRate: string | null; verificationState: string; fetchedAt: string | null }>;
  performance: { campaigns: number; completedPartnerships: number; verifiedConversions: number; approvedConversions: number; completionRate: string | null; commissions: Array<{ currency: string; netCommissionMinor: number | string }> };
}

function InviteCard({ creatorId, businessId }: { creatorId: string; businessId: string }) {
  const campaigns = useApi<Array<{ id: string; name: string; status: string }>>(`/businesses/${businessId}/campaigns?limit=100`);
  const open = (campaigns.data?.data ?? []).filter((c) => ['published', 'active'].includes(c.status));
  const [f, setF] = useState({ campaignId: '', message: '', expiresInDays: '14' });
  const [done, setDone] = useState(false);
  const invite = useApiMutation<Record<string, unknown>>('POST', `/businesses/${businessId}/invitations`, { invalidate: [`/businesses/${businessId}/invitations`], onSuccess: () => setDone(true) });
  return (
    <Card title="Invite to a campaign">
      {open.length === 0 ? (
        <p className="text-sm text-slate-600">You need a published campaign to invite creators. <Link className="underline" href="/business/campaigns">Your campaigns</Link></p>
      ) : (
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); setDone(false); invite.mutate({ creatorId, campaignId: f.campaignId, message: f.message || undefined, expiresInDays: Number.parseInt(f.expiresInDays, 10) || undefined }); }}>
          <Field label="Campaign" required>{(p) => <Select {...p} value={f.campaignId} onChange={(e) => setF({ ...f, campaignId: e.target.value })} placeholder="Choose…" options={open.map((c) => ({ value: c.id, label: c.name }))} />}</Field>
          <Field label="Message (optional)">{(p) => <Textarea {...p} rows={3} value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} />}</Field>
          <Field label="Expires after (days)">{(p) => <Input {...p} inputMode="numeric" value={f.expiresInDays} onChange={(e) => setF({ ...f, expiresInDays: e.target.value })} />}</Field>
          {invite.error && <Alert tone="error">{errorMessage(invite.error)}</Alert>}
          {done && <Alert tone="success">Invitation sent.</Alert>}
          <Button type="submit" loading={invite.isPending} disabled={!f.campaignId}>Send invitation</Button>
        </form>
      )}
    </Card>
  );
}

export default function CreatorProfileForBusiness({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { businessId, can } = useSession();
  const q = useApi<CreatorDetail>(`/creators/${id}`);
  if (!businessId) return <LoadingState />;
  return (
    <div className="space-y-6">
      <Link href="/business/creators" className="text-sm text-brand-700 underline">← Find creators</Link>
      <QueryView query={q}>
        {(c) => (
          <>
            <PageHeader title={c.displayName} description={`@${c.handle}${c.city || c.country ? ` · ${[c.city, c.country].filter(Boolean).join(', ')}` : ''}`} actions={c.verificationStatus === 'verified' ? <Badge tone="green">Verified creator</Badge> : undefined} />
            <div className="grid gap-6 lg:grid-cols-3">
              <div className="space-y-6 lg:col-span-2">
                <Card title="About">
                  {c.bio && <p className="whitespace-pre-wrap text-sm text-slate-700">{c.bio}</p>}
                  <div className="mt-3 flex flex-wrap gap-1">{c.categories.map((x) => <Badge key={x}>{x}</Badge>)}{c.languages.map((x) => <Badge key={x} tone="blue">{x}</Badge>)}</div>
                  {c.portfolioUrls.length > 0 && (
                    <ul className="mt-3 space-y-1 text-sm">{c.portfolioUrls.map((u) => <li key={u}><a className="break-all text-brand-700 underline" href={u} target="_blank" rel="noopener noreferrer nofollow">{u}</a></li>)}</ul>
                  )}
                </Card>
                <Card title="Social accounts">
                  <DataTable
                    caption="Social accounts"
                    rowKey={(r) => r.id}
                    rows={c.socialAccounts}
                    empty={<p className="text-sm text-slate-500">No social accounts listed.</p>}
                    columns={[
                      { key: 'p', header: 'Platform', render: (r) => (r.profileUrl ? <a className="text-brand-700 underline" href={r.profileUrl} target="_blank" rel="noopener noreferrer nofollow">{r.platform} @{r.handle}</a> : `${r.platform} @${r.handle}`) },
                      { key: 'f', header: 'Followers', render: (r) => r.followerCount?.toLocaleString() ?? '—' },
                      { key: 'v', header: 'Avg. views', render: (r) => r.averageViews?.toLocaleString() ?? '—' },
                      { key: 'e', header: 'Engagement', render: (r) => (r.engagementRate ? formatRate(r.engagementRate) : '—') },
                      { key: 's', header: 'Source', render: (r) => (r.verificationState === 'self_reported' ? 'Self-reported' : r.verificationState) },
                    ]}
                  />
                </Card>
              </div>
              <div className="space-y-6">
                <Card title="Track record on CODEK">
                  <DescriptionList
                    items={[
                      { label: 'Partnerships', value: c.performance.campaigns },
                      { label: 'Completed', value: c.performance.completedPartnerships },
                      { label: 'Verified sales', value: c.performance.verifiedConversions },
                      { label: 'Approved sales', value: c.performance.approvedConversions },
                      { label: 'Content delivered', value: c.performance.completionRate ? formatRate(c.performance.completionRate) : '—' },
                      ...c.performance.commissions.map((m) => ({ label: `Commission earned (${m.currency})`, value: <Money minor={m.netCommissionMinor} currency={m.currency} /> })),
                    ]}
                  />
                </Card>
                {can('application.review') && <InviteCard creatorId={c.id} businessId={businessId} />}
              </div>
            </div>
          </>
        )}
      </QueryView>
    </div>
  );
}
