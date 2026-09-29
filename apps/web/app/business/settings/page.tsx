'use client';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Card, ConfirmButton, DataTable, Field, Input, LoadingState, PageHeader, Select, StatusBadge, Textarea } from '@codek/ui';
import { DateText } from '@/components/format';
import { QueryView } from '@/components/query-view';
import { api, errorMessage, useApi, useApiMutation } from '@/lib/api';
import { useSession } from '@/lib/session';

interface Business { id: string; legalName: string; displayName: string; category: string; description: string | null; country: string; city: string | null; timezone: string; websiteUrl: string | null; allowedDestinationHosts: string[]; verificationStatus: string; version: number; myRole: string }
interface Member { id: string; status: string; role: string; user: { id: string; name: string; email: string }; createdAt: string }

function ProfileCard({ b }: { b: Business }) {
  const { can } = useSession();
  const [f, setF] = useState({ legalName: b.legalName, displayName: b.displayName, category: b.category, description: b.description ?? '', city: b.city ?? '', timezone: b.timezone, websiteUrl: b.websiteUrl ?? '', hosts: b.allowedDestinationHosts.join(', ') });
  const [ok, setOk] = useState(false);
  const save = useApiMutation<Record<string, unknown>>('PATCH', `/businesses/${b.id}`, { invalidate: [`/businesses`], onSuccess: () => setOk(true) });
  const fe = save.error?.fieldErrors ?? {};
  const editable = can('business.profile.update');
  const input = (k: keyof typeof f, label: string, props: Record<string, unknown> = {}, hint?: string) => (
    <Field label={label} hint={hint} error={fe[k === 'hosts' ? 'allowedDestinationHosts' : k]}>
      {(p) => <Input {...p} {...props} disabled={!editable} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />}
    </Field>
  );
  return (
    <Card title="Business profile">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          setOk(false);
          save.mutate({ version: b.version, legalName: f.legalName, displayName: f.displayName, category: f.category, description: f.description || undefined, city: f.city || undefined, timezone: f.timezone, websiteUrl: f.websiteUrl || undefined, allowedDestinationHosts: f.hosts.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean) });
        }}
      >
        {input('legalName', 'Legal name')}
        {input('displayName', 'Display name')}
        {input('category', 'Category')}
        <Field label="Description">{(p) => <Textarea {...p} disabled={!editable} rows={3} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />}</Field>
        <div className="grid gap-4 sm:grid-cols-2">{input('city', 'City')}{input('timezone', 'Time zone')}</div>
        {input('websiteUrl', 'Website', { type: 'url' })}
        {input('hosts', 'Allowed link domains', {}, 'Comma-separated. Campaign links may only point to these domains.')}
        {save.error && <Alert tone="error">{save.error.code === 'VERSION_CONFLICT' ? 'Someone else changed this profile. Reload and try again.' : errorMessage(save.error)}</Alert>}
        {ok && <Alert tone="success">Saved.</Alert>}
        {editable && <Button type="submit" loading={save.isPending}>Save</Button>}
      </form>
    </Card>
  );
}

function VerificationCard({ b }: { b: Business }) {
  const [f, setF] = useState({ registrationNumber: '', notes: '' });
  const req = useApiMutation<Record<string, unknown>>('POST', `/businesses/${b.id}/verification`, { invalidate: ['/businesses'] });
  const canRequest = ['unverified', 'expired', 'suspended'].includes(b.verificationStatus);
  return (
    <Card title="Verification" actions={<StatusBadge status={b.verificationStatus} />}>
      {canRequest ? (
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); req.mutate({ registrationNumber: f.registrationNumber || undefined, notes: f.notes || undefined }); }}>
          <p className="text-sm text-slate-600">Verified businesses get a badge on their campaigns and can publish without manual review.</p>
          <Field label="Commercial registration number">{(p) => <Input {...p} value={f.registrationNumber} onChange={(e) => setF({ ...f, registrationNumber: e.target.value })} />}</Field>
          <Field label="Notes for the reviewer">{(p) => <Textarea {...p} rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />}</Field>
          {req.error && <Alert tone="error">{errorMessage(req.error)}</Alert>}
          <Button type="submit" loading={req.isPending}>Request verification</Button>
        </form>
      ) : (
        <p className="text-sm text-slate-600">{b.verificationStatus === 'pending' ? 'Your verification request is being reviewed.' : 'Your business is verified.'}</p>
      )}
    </Card>
  );
}

function TeamCard({ businessId }: { businessId: string }) {
  const { can, session } = useSession();
  const qc = useQueryClient();
  const q = useApi<Member[]>(`/businesses/${businessId}/members`);
  const [f, setF] = useState({ email: '', role: 'business_manager' });
  const invite = useApiMutation<typeof f>('POST', `/businesses/${businessId}/members`, { invalidate: [`/businesses/${businessId}/members`], onSuccess: () => setF({ email: '', role: 'business_manager' }) });
  const manage = can('business.members.manage');
  return (
    <Card title="Team" description="Owners manage everything; managers run campaigns and review sales; viewers can only look.">
      <QueryView query={q}>
        {(rows) => (
          <DataTable
            caption="Team members"
            rowKey={(r) => r.id}
            rows={rows}
            columns={[
              { key: 'n', header: 'Name', render: (r) => r.user.name },
              { key: 'e', header: 'Email', render: (r) => r.user.email },
              { key: 'r', header: 'Role', render: (r) => r.role.replace('business_', '') },
              { key: 's', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
              { key: 'd', header: 'Added', render: (r) => <DateText value={r.createdAt} /> },
              {
                key: 'a',
                header: '',
                render: (r) =>
                  manage && r.status !== 'revoked' && r.user.id !== session?.user.id && r.role !== 'business_owner' ? (
                    <ConfirmButton label="Remove" title={`Remove ${r.user.name}?`} consequence="They immediately lose access to this business." confirmLabel="Remove" onConfirm={async () => { await api(`/businesses/${businessId}/members/${r.id}/revoke`, { method: 'POST', json: {} }); await qc.invalidateQueries({ queryKey: [`/businesses/${businessId}/members`] }); }} />
                  ) : null,
              },
            ]}
          />
        )}
      </QueryView>
      {manage && (
        <form className="mt-4 grid gap-3 sm:grid-cols-[2fr_1fr_auto]" onSubmit={(e) => { e.preventDefault(); invite.mutate(f); }}>
          <Field label="Email">{(p) => <Input {...p} type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />}</Field>
          <Field label="Role">{(p) => <Select {...p} value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} options={[{ value: 'business_manager', label: 'Manager' }, { value: 'business_viewer', label: 'Viewer' }]} />}</Field>
          <div className="flex items-end"><Button type="submit" loading={invite.isPending}>Invite</Button></div>
          {invite.error && <div className="sm:col-span-3"><Alert tone="error">{errorMessage(invite.error)}</Alert></div>}
        </form>
      )}
    </Card>
  );
}

export default function BusinessSettings() {
  const { businessId } = useSession();
  const q = useApi<Business>(businessId ? `/businesses/${businessId}` : null);
  if (!businessId) return <LoadingState />;
  return (
    <div className="space-y-6">
      <PageHeader title="Business settings" actions={<a className="text-sm text-brand-700 underline" href="/business/onboarding">Add another business</a>} />
      <QueryView query={q}>
        {(b) => (
          <div className="grid gap-6 xl:grid-cols-2">
            <ProfileCard key={b.version} b={b} />
            <div className="space-y-6">
              <VerificationCard b={b} />
              <TeamCard businessId={b.id} />
            </div>
          </div>
        )}
      </QueryView>
    </div>
  );
}
