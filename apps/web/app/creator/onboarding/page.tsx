'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Alert, Button, Card, Field, Input, PageHeader, Textarea } from '@codek/ui';
import { errorMessage, useApiMutation } from '@/lib/api';
import { useSession } from '@/lib/session';

const splitTags = (v: string) => v.split(',').map((s) => s.trim()).filter(Boolean);

export default function CreatorOnboarding() {
  const router = useRouter();
  const { session, refresh } = useSession();
  const [f, setF] = useState({ handle: '', displayName: session?.user.displayName ?? '', bio: '', country: '', city: '', categories: '', languages: '' });
  const create = useApiMutation<Record<string, unknown>>('POST', '/creator/profile', {
    onSuccess: async () => {
      await refresh();
      router.replace('/creator');
    },
  });
  if (session?.creatorId) {
    return (
      <Alert tone="success">
        Your creator profile is set up. <a className="underline" href="/creator">Go to your dashboard</a>.
      </Alert>
    );
  }
  const fieldErr = (name: string) => create.error?.fieldErrors?.[name];
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title="Set up your creator profile" description="Businesses see this profile when you apply. You can change everything except your handle later." />
      <Card>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate({
              handle: f.handle,
              displayName: f.displayName,
              bio: f.bio || undefined,
              country: f.country ? f.country.toUpperCase() : undefined,
              city: f.city || undefined,
              categories: splitTags(f.categories),
              languages: splitTags(f.languages),
            });
          }}
        >
          <Field label="Handle" required hint="3–30 characters: letters, numbers, “_” or “.”" error={fieldErr('handle')}>
            {(p) => <Input {...p} value={f.handle} onChange={(e) => setF({ ...f, handle: e.target.value })} autoComplete="off" />}
          </Field>
          <Field label="Display name" required error={fieldErr('displayName')}>
            {(p) => <Input {...p} value={f.displayName} onChange={(e) => setF({ ...f, displayName: e.target.value })} />}
          </Field>
          <Field label="Short bio" error={fieldErr('bio')}>
            {(p) => <Textarea {...p} rows={3} maxLength={2000} value={f.bio} onChange={(e) => setF({ ...f, bio: e.target.value })} />}
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Country (2-letter code)" hint="For example JO or AE" error={fieldErr('country')}>
              {(p) => <Input {...p} maxLength={2} value={f.country} onChange={(e) => setF({ ...f, country: e.target.value })} />}
            </Field>
            <Field label="City" error={fieldErr('city')}>
              {(p) => <Input {...p} value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} />}
            </Field>
          </div>
          <Field label="Content categories" hint="Comma-separated, e.g. food, beauty, fitness" error={fieldErr('categories')}>
            {(p) => <Input {...p} value={f.categories} onChange={(e) => setF({ ...f, categories: e.target.value })} />}
          </Field>
          <Field label="Languages" hint="Comma-separated, e.g. ar, en" error={fieldErr('languages')}>
            {(p) => <Input {...p} value={f.languages} onChange={(e) => setF({ ...f, languages: e.target.value })} />}
          </Field>
          {create.error && <Alert tone="error">{errorMessage(create.error)}</Alert>}
          <Button type="submit" loading={create.isPending}>Create profile</Button>
        </form>
      </Card>
    </div>
  );
}
