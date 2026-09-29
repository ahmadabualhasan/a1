'use client';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Card, DataTable, EmptyState, Field, Input, LoadingState, PageHeader, Select, StatusBadge, Textarea } from '@codek/ui';
import { Money } from '@/components/format';
import { PagedList } from '@/components/paged';
import { api, errorMessage, toMinorUnits, useApiMutation } from '@/lib/api';
import { useSession } from '@/lib/session';

interface Item { id: string; name: string; type: string; description: string | null; category: string | null; priceMinor: number | null; currency: string | null; active: boolean; version: number }

function NewItem({ businessId }: { businessId: string }) {
  const [f, setF] = useState({ name: '', type: 'product', description: '', category: '', price: '', currency: 'JOD', externalRef: '' });
  const [priceErr, setPriceErr] = useState<string | undefined>();
  const create = useApiMutation<Record<string, unknown>>('POST', `/businesses/${businessId}/catalog`, { invalidate: [`/businesses/${businessId}/catalog`], onSuccess: () => setF({ ...f, name: '', description: '', price: '', externalRef: '' }) });
  const fe = create.error?.fieldErrors ?? {};
  return (
    <Card title="Add a product or service">
      <form
        className="grid gap-3 md:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          const priceMinor = f.price.trim() ? toMinorUnits(f.price, f.currency) : undefined;
          if (priceMinor === null) return setPriceErr(`Enter a price in ${f.currency}`);
          setPriceErr(undefined);
          create.mutate({ name: f.name, type: f.type, description: f.description || undefined, category: f.category || undefined, priceMinor, currency: priceMinor != null ? f.currency : undefined, externalRef: f.externalRef || undefined });
        }}
      >
        <Field label="Name" required error={fe.name}>{(p) => <Input {...p} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />}</Field>
        <Field label="Type">{(p) => <Select {...p} value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })} options={[{ value: 'product', label: 'Product' }, { value: 'service', label: 'Service' }, { value: 'subscription', label: 'Subscription' }, { value: 'other', label: 'Other' }]} />}</Field>
        <Field label="Price" error={priceErr ?? fe.priceMinor}>{(p) => <Input {...p} inputMode="decimal" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} />}</Field>
        <Field label="Currency">{(p) => <Select {...p} value={f.currency} onChange={(e) => setF({ ...f, currency: e.target.value })} options={['JOD', 'USD', 'AED', 'SAR', 'EUR'].map((c) => ({ value: c, label: c }))} />}</Field>
        <Field label="Category">{(p) => <Input {...p} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} />}</Field>
        <Field label="Your SKU / reference" hint="Used to match items in orders from your store">{(p) => <Input {...p} value={f.externalRef} onChange={(e) => setF({ ...f, externalRef: e.target.value })} />}</Field>
        <div className="md:col-span-2"><Field label="Description">{(p) => <Textarea {...p} rows={2} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />}</Field></div>
        {create.error && <div className="md:col-span-2"><Alert tone="error">{errorMessage(create.error)}</Alert></div>}
        <div><Button type="submit" loading={create.isPending}>Add</Button></div>
      </form>
    </Card>
  );
}

export default function CatalogPage() {
  const { businessId, can } = useSession();
  const qc = useQueryClient();
  if (!businessId) return <LoadingState />;
  const toggle = async (i: Item) => {
    await api(`/businesses/${businessId}/catalog/${i.id}`, { method: 'PATCH', json: { version: i.version, active: !i.active } });
    await qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith(`/businesses/${businessId}/catalog`) });
  };
  return (
    <div className="space-y-6">
      <PageHeader title="Products & services" description="What creators promote. Each campaign is linked to one item." />
      {can('catalog.manage') && <NewItem businessId={businessId} />}
      <PagedList<Item> path={`/businesses/${businessId}/catalog`} empty={<EmptyState title="No products or services yet" />}>
        {(rows) => (
          <DataTable
            caption="Catalog"
            rowKey={(r) => r.id}
            rows={rows}
            columns={[
              { key: 'n', header: 'Name', render: (r) => <span className="font-medium">{r.name}</span> },
              { key: 't', header: 'Type', render: (r) => r.type },
              { key: 'p', header: 'Price', render: (r) => <Money minor={r.priceMinor} currency={r.currency} /> },
              { key: 'c', header: 'Category', render: (r) => r.category ?? '—' },
              { key: 's', header: 'Status', render: (r) => <StatusBadge status={r.active ? 'active' : 'inactive'} /> },
              { key: 'a', header: '', render: (r) => (can('catalog.manage') ? <Button size="sm" variant="secondary" onClick={() => toggle(r)}>{r.active ? 'Deactivate' : 'Activate'}</Button> : null) },
            ]}
          />
        )}
      </PagedList>
    </div>
  );
}
