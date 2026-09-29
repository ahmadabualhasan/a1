'use client';
import { useState } from 'react';
import { Alert, Button, Card, ConfirmButton, DataTable, Field, Input, PageHeader, Select, StatusBadge, Textarea } from '@codek/ui';
import { QueryView } from '@/components/query-view';
import { api, errorMessage, useApi, useApiMutation } from '@/lib/api';
import { useQueryClient } from '@tanstack/react-query';

interface Social {
  id: string;
  platform: string;
  handle: string;
  profileUrl: string | null;
  verificationState: string;
  followerCount: number | null;
  averageViews: number | null;
  engagementRate: string | null;
}
interface Profile {
  id: string;
  handle: string;
  displayName: string;
  bio: string | null;
  country: string | null;
  city: string | null;
  languages: string[];
  categories: string[];
  portfolioUrls: string[];
  verificationStatus: string;
  version: number;
  socialAccounts: Social[];
}

const PLATFORMS = ['instagram', 'tiktok', 'youtube', 'snapchat', 'x', 'facebook', 'linkedin', 'twitch', 'other'];
const split = (v: string) => v.split(',').map((s) => s.trim()).filter(Boolean);
const PROVENANCE: Record<string, string> = { self_reported: 'Self-reported', verified: 'Verified', connected: 'Connected', unverified: 'Unverified' };

function ProfileForm({ p }: { p: Profile }) {
  const [f, setF] = useState({ displayName: p.displayName, bio: p.bio ?? '', country: p.country ?? '', city: p.city ?? '', categories: p.categories.join(', '), languages: p.languages.join(', '), portfolioUrls: p.portfolioUrls.join('\n') });
  const [ok, setOk] = useState(false);
  const save = useApiMutation<Record<string, unknown>>('PATCH', '/creator/profile', { invalidate: ['/creator/profile'], onSuccess: () => setOk(true) });
  const fe = save.error?.fieldErrors ?? {};
  return (
    <Card title="Public profile" description={`@${p.handle} — shown to businesses when you apply or when they search for creators.`}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          setOk(false);
          save.mutate({
            version: p.version,
            displayName: f.displayName,
            bio: f.bio || undefined,
            country: f.country ? f.country.toUpperCase() : undefined,
            city: f.city || undefined,
            categories: split(f.categories),
            languages: split(f.languages),
            portfolioUrls: f.portfolioUrls.split('\n').map((s) => s.trim()).filter(Boolean),
          });
        }}
      >
        <Field label="Display name" required error={fe.displayName}>{(x) => <Input {...x} value={f.displayName} onChange={(e) => setF({ ...f, displayName: e.target.value })} />}</Field>
        <Field label="Bio" error={fe.bio}>{(x) => <Textarea {...x} rows={3} value={f.bio} onChange={(e) => setF({ ...f, bio: e.target.value })} />}</Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Country (2-letter code)" error={fe.country}>{(x) => <Input {...x} maxLength={2} value={f.country} onChange={(e) => setF({ ...f, country: e.target.value })} />}</Field>
          <Field label="City" error={fe.city}>{(x) => <Input {...x} value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} />}</Field>
        </div>
        <Field label="Categories" hint="Comma-separated" error={fe.categories}>{(x) => <Input {...x} value={f.categories} onChange={(e) => setF({ ...f, categories: e.target.value })} />}</Field>
        <Field label="Languages" hint="Comma-separated" error={fe.languages}>{(x) => <Input {...x} value={f.languages} onChange={(e) => setF({ ...f, languages: e.target.value })} />}</Field>
        <Field label="Portfolio links" hint="One https:// link per line (up to 10)" error={fe.portfolioUrls}>{(x) => <Textarea {...x} rows={3} value={f.portfolioUrls} onChange={(e) => setF({ ...f, portfolioUrls: e.target.value })} />}</Field>
        {save.error && <Alert tone="error">{save.error.code === 'VERSION_CONFLICT' ? 'Your profile changed in another tab. Reload the page and try again.' : errorMessage(save.error)}</Alert>}
        {ok && <Alert tone="success">Profile saved.</Alert>}
        <Button type="submit" loading={save.isPending}>Save profile</Button>
      </form>
    </Card>
  );
}

function SocialAccounts({ rows }: { rows: Social[] }) {
  const qc = useQueryClient();
  const [f, setF] = useState({ platform: 'instagram', handle: '', profileUrl: '', followerCount: '', averageViews: '' });
  const add = useApiMutation<Record<string, unknown>>('POST', '/creator/social-accounts', { invalidate: ['/creator/profile'], onSuccess: () => setF({ platform: 'instagram', handle: '', profileUrl: '', followerCount: '', averageViews: '' }) });
  const int = (v: string) => (v.trim() ? Number.parseInt(v, 10) : undefined);
  return (
    <Card title="Social accounts" description="Numbers you enter are labelled as self-reported until verified by CODEK.">
      <DataTable
        caption="Your social accounts"
        rowKey={(r) => r.id}
        rows={rows}
        empty={<p className="mb-4 text-sm text-slate-500">No social accounts yet.</p>}
        columns={[
          { key: 'p', header: 'Platform', render: (r) => r.platform },
          { key: 'h', header: 'Handle', render: (r) => (r.profileUrl ? <a className="text-brand-700 underline" href={r.profileUrl} target="_blank" rel="noopener noreferrer nofollow">{r.handle}</a> : r.handle) },
          { key: 'f', header: 'Followers', render: (r) => r.followerCount?.toLocaleString() ?? '—' },
          { key: 'v', header: 'Avg. views', render: (r) => r.averageViews?.toLocaleString() ?? '—' },
          { key: 's', header: 'Source', render: (r) => PROVENANCE[r.verificationState] ?? r.verificationState },
          {
            key: 'a',
            header: '',
            render: (r) => (
              <ConfirmButton
                label="Remove"
                title={`Remove ${r.platform}?`}
                consequence="The account is removed from your profile."
                confirmLabel="Remove"
                onConfirm={async () => {
                  await api(`/creator/social-accounts/${r.id}`, { method: 'DELETE' });
                  await qc.invalidateQueries({ queryKey: ['/creator/profile'] });
                }}
              />
            ),
          },
        ]}
      />
      <form
        className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
        onSubmit={(e) => {
          e.preventDefault();
          add.mutate({ platform: f.platform, handle: f.handle, profileUrl: f.profileUrl || undefined, followerCount: int(f.followerCount), averageViews: int(f.averageViews) });
        }}
      >
        <Field label="Platform">{(x) => <Select {...x} value={f.platform} onChange={(e) => setF({ ...f, platform: e.target.value })} options={PLATFORMS.map((v) => ({ value: v, label: v }))} />}</Field>
        <Field label="Handle" required>{(x) => <Input {...x} value={f.handle} onChange={(e) => setF({ ...f, handle: e.target.value })} />}</Field>
        <Field label="Profile link">{(x) => <Input {...x} type="url" placeholder="https://" value={f.profileUrl} onChange={(e) => setF({ ...f, profileUrl: e.target.value })} />}</Field>
        <Field label="Followers">{(x) => <Input {...x} inputMode="numeric" pattern="[0-9]*" value={f.followerCount} onChange={(e) => setF({ ...f, followerCount: e.target.value })} />}</Field>
        <Field label="Average views">{(x) => <Input {...x} inputMode="numeric" pattern="[0-9]*" value={f.averageViews} onChange={(e) => setF({ ...f, averageViews: e.target.value })} />}</Field>
        <div className="flex items-end"><Button type="submit" loading={add.isPending}>Add account</Button></div>
        {add.error && <div className="sm:col-span-2 lg:col-span-3"><Alert tone="error">{errorMessage(add.error)}</Alert></div>}
      </form>
    </Card>
  );
}

function Verification({ p }: { p: Profile }) {
  const [notes, setNotes] = useState('');
  const req = useApiMutation<{ notes?: string }>('POST', '/creator/verification', { invalidate: ['/creator/profile'] });
  const canRequest = ['unverified', 'expired', 'suspended'].includes(p.verificationStatus);
  return (
    <Card title="Verification" actions={<StatusBadge status={p.verificationStatus} />}>
      {canRequest ? (
        <div className="space-y-3">
          <p className="text-sm text-slate-600">Verified creators can join verified-only campaigns. Our team reviews your profile and social accounts.</p>
          <Field label="Notes for the reviewer (optional)">{(x) => <Textarea {...x} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />}</Field>
          {req.error && <Alert tone="error">{errorMessage(req.error)}</Alert>}
          <Button loading={req.isPending} onClick={() => req.mutate({ notes: notes || undefined })}>Request verification</Button>
        </div>
      ) : (
        <p className="text-sm text-slate-600">{p.verificationStatus === 'pending' ? 'Your verification request is being reviewed.' : 'Your profile is verified.'}</p>
      )}
    </Card>
  );
}

export default function CreatorProfilePage() {
  const q = useApi<Profile>('/creator/profile');
  return (
    <div className="space-y-6">
      <PageHeader title="Profile" />
      <QueryView query={q}>
        {(p) => (
          <div className="grid gap-6 xl:grid-cols-2">
            <ProfileForm key={p.version} p={p} />
            <div className="space-y-6">
              <Verification p={p} />
              <SocialAccounts rows={p.socialAccounts} />
            </div>
          </div>
        )}
      </QueryView>
    </div>
  );
}
