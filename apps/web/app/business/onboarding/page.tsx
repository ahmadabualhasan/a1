'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Alert, Button, Card, Field, Input, PageHeader, Textarea } from '@codek/ui';
import { errorMessage, useApiMutation } from '@/lib/api';
import { useSession } from '@/lib/session';

export default function BusinessOnboarding() {
  const router = useRouter();
  const { refresh, setBusinessId, session } = useSession();
  const [f, setF] = useState({ legalName: '', displayName: '', category: '', description: '', country: '', city: '', timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, websiteUrl: '' });
  const create = useApiMutation<Record<string, unknown>, { id: string }>('POST', '/businesses', {
    invalidate: ['/businesses'],
    onSuccess: async (b) => {
      setBusinessId(b.id);
      await refresh();
      router.replace('/business');
    },
  });
  const fe = create.error?.fieldErrors ?? {};
  const input = (k: keyof typeof f, label: string, props: Record<string, unknown> = {}, hint?: string) => (
    <Field label={label} hint={hint} error={fe[k]} required={!!props.required}>
      {(p) => <Input {...p} {...props} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />}
    </Field>
  );
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title={session?.businesses.length ? 'Add another business' : 'Set up your business'} description="This information is shown to creators on your campaigns. Verification is requested separately." />
      <Card>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate({ ...f, description: f.description || undefined, city: f.city || undefined, websiteUrl: f.websiteUrl || undefined, country: f.country.toUpperCase() });
          }}
        >
          {input('legalName', 'Legal name', { required: true })}
          {input('displayName', 'Display name', { required: true }, 'The name creators see')}
          {input('category', 'Category', { required: true }, 'e.g. restaurant, beauty, retail')}
          <Field label="Description" error={fe.description}>{(p) => <Textarea {...p} rows={3} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />}</Field>
          <div className="grid gap-4 sm:grid-cols-2">
            {input('country', 'Country (2-letter code)', { required: true, maxLength: 2 })}
            {input('city', 'City')}
          </div>
          {input('timezone', 'Time zone', { required: true })}
          {input('websiteUrl', 'Website', { type: 'url', placeholder: 'https://' }, 'Campaign links must point to this domain')}
          {create.error && <Alert tone="error">{errorMessage(create.error)}</Alert>}
          <Button type="submit" loading={create.isPending}>Create business</Button>
        </form>
      </Card>
    </div>
  );
}
