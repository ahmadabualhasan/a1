'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Alert, Badge, Button, Card, ConfirmButton, DataTable, EmptyState, LoadingState, PageHeader, Select, StatusBadge, Tabs } from '@codek/ui';
import { DateText } from '@/components/format';
import { PagedList } from '@/components/paged';
import { QueryView } from '@/components/query-view';
import { api, errorMessage, useApi } from '@/lib/api';
import { useSession } from '@/lib/session';

interface Application {
  id: string;
  status: string;
  message: string | null;
  submittedAt: string;
  waitlistPosition: number | null;
  rejectionReason: string | null;
  campaign: { id: string; name: string };
  creator: { id: string; handle: string; displayName: string; city: string | null; country: string | null; categories: string[]; verificationStatus: string; socialAccounts: Array<{ platform: string; followerCount: number | null; verificationState: string }> };
}
interface Invitation { id: string; status: string; createdAt: string; expiresAt: string | null; campaign: { id: string; name: string }; creator: { id: string; handle: string; displayName: string } }

function ApplicationCard({ a }: { a: Application }) {
  const qc = useQueryClient();
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<unknown>) => {
    setErr(null);
    setBusy(true);
    try {
      await fn();
      await qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).includes('/applications') || String(q.queryKey[0]).includes('/partnerships') });
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const open = ['pending', 'waitlisted'].includes(a.status);
  return (
    <Card
      title={<Link className="hover:underline" href={`/business/creators/${a.creator.id}`}>{a.creator.displayName} <span className="font-normal text-slate-500">@{a.creator.handle}</span></Link>}
      description={`${a.campaign.name} · applied ${new Date(a.submittedAt).toLocaleDateString()}`}
      actions={<StatusBadge status={a.status} />}
    >
      <div className="flex flex-wrap gap-1">
        {a.creator.verificationStatus === 'verified' && <Badge tone="green">Verified</Badge>}
        {a.creator.socialAccounts.map((s) => (
          <Badge key={s.platform} tone="blue">{s.platform}: {s.followerCount?.toLocaleString() ?? '—'}{s.verificationState === 'self_reported' ? ' (self-reported)' : ''}</Badge>
        ))}
        {[a.creator.city, a.creator.country].filter(Boolean).length > 0 && <Badge>{[a.creator.city, a.creator.country].filter(Boolean).join(', ')}</Badge>}
      </div>
      {a.message && <p className="mt-3 whitespace-pre-wrap text-sm text-slate-700">“{a.message}”</p>}
      {a.status === 'waitlisted' && a.waitlistPosition != null && <p className="mt-2 text-xs text-slate-500">Waitlist position #{a.waitlistPosition}</p>}
      {a.rejectionReason && <p className="mt-2 text-xs text-slate-500">Reason: {a.rejectionReason}</p>}
      {open && (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button size="sm" loading={busy} onClick={() => run(() => api(`/applications/${a.id}/accept`, { method: 'POST', json: {} }))}>Accept</Button>
          <ConfirmButton label="Decline" title="Decline this application?" consequence="The creator is notified. You can add a short reason." confirmLabel="Decline" requireReason onConfirm={(reason) => run(() => api(`/applications/${a.id}/reject`, { method: 'POST', json: { reason: reason || undefined } }))} />
        </div>
      )}
      {err && <div className="mt-3"><Alert tone="error">{err}</Alert></div>}
    </Card>
  );
}

function Applications({ businessId }: { businessId: string }) {
  const params = useSearchParams();
  const [status, setStatus] = useState('pending');
  const [campaignId, setCampaignId] = useState(params.get('campaignId') ?? '');
  const campaigns = useApi<Array<{ id: string; name: string }>>(`/businesses/${businessId}/campaigns?limit=100`);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <label className="text-sm"><span className="sr-only">Campaign</span><Select value={campaignId} onChange={(e) => setCampaignId(e.target.value)} options={[{ value: '', label: 'All campaigns' }, ...(campaigns.data?.data ?? []).map((c) => ({ value: c.id, label: c.name }))]} /></label>
        <label className="text-sm"><span className="sr-only">Status</span><Select value={status} onChange={(e) => setStatus(e.target.value)} options={[{ value: '', label: 'All' }, { value: 'pending', label: 'Pending' }, { value: 'waitlisted', label: 'Waitlisted' }, { value: 'accepted', label: 'Accepted' }, { value: 'rejected', label: 'Declined' }, { value: 'withdrawn', label: 'Withdrawn' }]} /></label>
      </div>
      <PagedList<Application> key={`${status}:${campaignId}`} path={`/businesses/${businessId}/applications`} params={{ status, campaignId }} empty={<EmptyState title="No applications" description="Publish a campaign or invite creators directly." />}>
        {(rows) => <div className="grid gap-4 lg:grid-cols-2">{rows.map((a) => <ApplicationCard key={a.id} a={a} />)}</div>}
      </PagedList>
    </div>
  );
}

function Invitations({ businessId }: { businessId: string }) {
  const qc = useQueryClient();
  const q = useApi<Invitation[]>(`/businesses/${businessId}/invitations`);
  return (
    <QueryView query={q} empty={<EmptyState title="No invitations sent" action={<Link className="text-brand-700 underline" href="/business/creators">Find creators</Link>} />}>
      {(rows) => (
        <DataTable
          caption="Invitations"
          rowKey={(r) => r.id}
          rows={rows}
          columns={[
            { key: 'c', header: 'Creator', render: (r) => <Link className="hover:underline" href={`/business/creators/${r.creator.id}`}>@{r.creator.handle}</Link> },
            { key: 'p', header: 'Campaign', render: (r) => r.campaign.name },
            { key: 's', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
            { key: 'd', header: 'Sent', render: (r) => <DateText value={r.createdAt} /> },
            { key: 'e', header: 'Expires', render: (r) => <DateText value={r.expiresAt} /> },
            {
              key: 'a',
              header: '',
              render: (r) =>
                r.status === 'pending' ? (
                  <ConfirmButton label="Revoke" title="Revoke invitation?" consequence="The creator can no longer accept it." confirmLabel="Revoke" onConfirm={async () => { await api(`/invitations/${r.id}/revoke`, { method: 'POST', json: {} }); await qc.invalidateQueries({ queryKey: [`/businesses/${businessId}/invitations`] }); }} />
                ) : null,
            },
          ]}
        />
      )}
    </QueryView>
  );
}

export default function BusinessApplications() {
  const { businessId } = useSession();
  if (!businessId) return <LoadingState />;
  return (
    <div className="space-y-6">
      <PageHeader title="Applications & invitations" />
      <Tabs
        tabs={[
          { id: 'apps', label: 'Applications', content: <Suspense><Applications businessId={businessId} /></Suspense> },
          { id: 'inv', label: 'Invitations sent', content: <Invitations businessId={businessId} /> },
        ]}
      />
    </div>
  );
}
