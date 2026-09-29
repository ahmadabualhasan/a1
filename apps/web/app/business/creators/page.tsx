'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Badge, Button, Card, Checkbox, EmptyState, Field, Input, PageHeader, Select } from '@codek/ui';
import { PagedList } from '@/components/paged';

interface Creator {
  id: string;
  handle: string;
  displayName: string;
  bio: string | null;
  city: string | null;
  country: string | null;
  categories: string[];
  verificationStatus: string;
  socialAccounts: Array<{ platform: string; followerCount: number | null; verificationState: string }>;
}

const PLATFORMS = ['', 'instagram', 'tiktok', 'youtube', 'snapchat', 'x', 'facebook', 'linkedin', 'twitch'];

export default function FindCreators() {
  const [draft, setDraft] = useState({ q: '', category: '', country: '', platform: '', minFollowers: '', verifiedOnly: false });
  const [filters, setFilters] = useState(draft);
  const params = { q: filters.q, category: filters.category, country: filters.country.toUpperCase(), platform: filters.platform, minFollowers: filters.minFollowers, verifiedOnly: filters.verifiedOnly ? 'true' : undefined };
  return (
    <div className="space-y-6">
      <PageHeader title="Find creators" description="Follower numbers are labelled self-reported unless verified." />
      <Card>
        <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6" onSubmit={(e) => { e.preventDefault(); setFilters(draft); }}>
          <Field label="Search">{(p) => <Input {...p} value={draft.q} onChange={(e) => setDraft({ ...draft, q: e.target.value })} placeholder="Name or handle" />}</Field>
          <Field label="Category">{(p) => <Input {...p} value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })} />}</Field>
          <Field label="Country">{(p) => <Input {...p} maxLength={2} value={draft.country} onChange={(e) => setDraft({ ...draft, country: e.target.value })} placeholder="JO" />}</Field>
          <Field label="Platform">{(p) => <Select {...p} value={draft.platform} onChange={(e) => setDraft({ ...draft, platform: e.target.value })} options={PLATFORMS.map((x) => ({ value: x, label: x || 'Any' }))} />}</Field>
          <Field label="Min. followers">{(p) => <Input {...p} inputMode="numeric" value={draft.minFollowers} onChange={(e) => setDraft({ ...draft, minFollowers: e.target.value })} />}</Field>
          <div className="flex flex-col justify-end gap-2">
            <Checkbox label="Verified only" checked={draft.verifiedOnly} onChange={(e) => setDraft({ ...draft, verifiedOnly: e.target.checked })} />
            <Button type="submit" size="sm">Search</Button>
          </div>
        </form>
      </Card>
      <PagedList<Creator> key={JSON.stringify(filters)} path="/creators" params={params} empty={<EmptyState title="No creators match these filters" />}>
        {(rows) => (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {rows.map((c) => (
              <Link key={c.id} href={`/business/creators/${c.id}`} className="block rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:border-brand-300">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">{c.displayName}</p>
                    <p className="text-sm text-slate-500">@{c.handle}{c.city || c.country ? ` · ${[c.city, c.country].filter(Boolean).join(', ')}` : ''}</p>
                  </div>
                  {c.verificationStatus === 'verified' && <Badge tone="green">Verified</Badge>}
                </div>
                {c.bio && <p className="mt-2 line-clamp-2 text-sm text-slate-600">{c.bio}</p>}
                <div className="mt-3 flex flex-wrap gap-1">
                  {c.socialAccounts.map((s) => <Badge key={s.platform} tone="blue">{s.platform} {s.followerCount?.toLocaleString() ?? ''}{s.verificationState === 'self_reported' ? '*' : ''}</Badge>)}
                  {c.categories.map((x) => <Badge key={x}>{x}</Badge>)}
                </div>
              </Link>
            ))}
          </div>
        )}
      </PagedList>
      <p className="text-xs text-slate-500">* self-reported by the creator</p>
    </div>
  );
}
