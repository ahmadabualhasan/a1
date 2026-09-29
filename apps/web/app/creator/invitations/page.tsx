'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Alert, Button, Card, EmptyState, PageHeader, StatusBadge } from '@codek/ui';
import { DateText } from '@/components/format';
import { QueryView } from '@/components/query-view';
import { errorMessage, useApi, useApiMutation } from '@/lib/api';

interface Invitation {
  id: string;
  status: string;
  message: string | null;
  expiresAt: string | null;
  createdAt: string;
  campaign: { id: string; name: string; status: string };
  business: { id: string; displayName: string };
}

function InvitationCard({ inv }: { inv: Invitation }) {
  const router = useRouter();
  const inval = ['/creator/invitations', '/creator/partnerships'];
  const accept = useApiMutation<{ id: string }, { partnership?: { id: string } }>('POST', (b) => `/invitations/${b.id}/accept`, {
    invalidate: inval,
    onSuccess: (r) => r.partnership && router.push(`/creator/partnerships/${r.partnership.id}`),
  });
  const decline = useApiMutation<{ id: string }>('POST', (b) => `/invitations/${b.id}/decline`, { invalidate: inval });
  const err = accept.error ?? decline.error;
  return (
    <Card
      title={inv.campaign.name}
      description={`From ${inv.business.displayName} · invited ${new Date(inv.createdAt).toLocaleDateString()}`}
      actions={<StatusBadge status={inv.status} />}
    >
      {inv.message && <p className="whitespace-pre-wrap text-sm text-slate-700">“{inv.message}”</p>}
      {inv.expiresAt && inv.status === 'pending' && <p className="mt-2 text-xs text-slate-500">Expires <DateText value={inv.expiresAt} withTime /></p>}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Link className="text-sm font-medium text-brand-700 underline" href={`/creator/marketplace/${inv.campaign.id}`}>Review campaign terms</Link>
        {inv.status === 'pending' && (
          <>
            <Button size="sm" loading={accept.isPending} onClick={() => accept.mutate({ id: inv.id })}>Accept & start</Button>
            <Button size="sm" variant="secondary" loading={decline.isPending} onClick={() => decline.mutate({ id: inv.id })}>Decline</Button>
          </>
        )}
      </div>
      {inv.status === 'pending' && <p className="mt-2 text-xs text-slate-500">Accepting agrees to the campaign terms shown on the campaign page. They are saved and cannot change for this partnership.</p>}
      {err && <div className="mt-3"><Alert tone="error">{errorMessage(err)}</Alert></div>}
    </Card>
  );
}

export default function CreatorInvitations() {
  const q = useApi<Invitation[]>('/creator/invitations');
  return (
    <div className="space-y-6">
      <PageHeader title="Invitations" description="Businesses that invited you directly to a campaign." />
      <QueryView query={q} empty={<EmptyState title="No invitations" description="Complete your profile and social accounts so businesses can find you." />}>
        {(rows) => <div className="grid gap-4 lg:grid-cols-2">{rows.map((i) => <InvitationCard key={i.id} inv={i} />)}</div>}
      </QueryView>
    </div>
  );
}
