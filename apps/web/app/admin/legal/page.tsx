'use client';
import { useState } from 'react';
import { Button, Card, Checkbox, DataTable, EmptyState, Field, Input, PageHeader, Select, StatusBadge, Textarea } from '@codek/ui';
import { ReasonButton, useRunner } from '@/components/admin';
import { DateText } from '@/components/format';
import { QueryView } from '@/components/query-view';
import { useApi } from '@/lib/api';

interface Doc { id: string; documentType: string; version: string; jurisdiction: string | null; title: string; status: string; requiredFor: string[]; publishedAt: string | null; createdAt: string; _count: { acceptances: number } }

const TYPES = ['terms_of_service', 'privacy_policy', 'business_agreement', 'creator_agreement', 'commission_terms', 'refund_dispute_policy', 'content_rights_terms', 'prohibited_categories'];

export default function Legal() {
  const q = useApi<Doc[]>('/admin/legal-documents');
  const { run, messages } = useRunner(['/admin/legal-documents']);
  const [f, setF] = useState({ documentType: 'terms_of_service', version: '', jurisdiction: '', title: '', content: '', business: true, creator: true });
  return (
    <div className="space-y-6">
      <PageHeader title="Legal documents" description="Documents are versioned. Publishing a new required version asks affected users to accept it again. Final wording must be approved by counsel (see DECISIONS D-022)." />
      {messages}
      <QueryView query={q} empty={<EmptyState title="No documents" />}>
        {(rows) => (
          <DataTable caption="Legal documents" rowKey={(r) => r.id} rows={rows} columns={[
            { key: 't', header: 'Type', render: (r) => r.documentType.replace(/_/g, ' ') },
            { key: 'v', header: 'Version', render: (r) => r.version },
            { key: 'ti', header: 'Title', render: (r) => r.title },
            { key: 'r', header: 'Required for', render: (r) => r.requiredFor.join(', ') || '—' },
            { key: 's', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
            { key: 'a', header: 'Acceptances', render: (r) => r._count.acceptances },
            { key: 'p', header: 'Published', render: (r) => <DateText value={r.publishedAt} /> },
            { key: 'x', header: '', render: (r) => (r.status === 'draft' ? <ReasonButton variant="primary" label="Publish" title={`Publish ${r.title} v${r.version}?`} consequence="Users who must accept it will be asked to on their next visit. Record why (e.g. counsel approval reference)." onReason={() => run(`/admin/legal-documents/${r.id}/publish`, {}, 'Published.')} /> : null) },
          ]} />
        )}
      </QueryView>
      <Card title="New draft">
        <form className="grid gap-3 md:grid-cols-3" onSubmit={(e) => { e.preventDefault(); void run('/admin/legal-documents', { documentType: f.documentType, version: f.version, jurisdiction: f.jurisdiction || undefined, title: f.title, content: f.content, requiredFor: [...(f.business ? ['business'] : []), ...(f.creator ? ['creator'] : [])] }, 'Draft saved.'); }}>
          <Field label="Type">{(p) => <Select {...p} value={f.documentType} onChange={(e) => setF({ ...f, documentType: e.target.value })} options={TYPES.map((t) => ({ value: t, label: t.replace(/_/g, ' ') }))} />}</Field>
          <Field label="Version" required>{(p) => <Input {...p} value={f.version} onChange={(e) => setF({ ...f, version: e.target.value })} placeholder="1.0" />}</Field>
          <Field label="Jurisdiction">{(p) => <Input {...p} value={f.jurisdiction} onChange={(e) => setF({ ...f, jurisdiction: e.target.value })} placeholder="JO" />}</Field>
          <div className="md:col-span-3"><Field label="Title" required>{(p) => <Input {...p} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />}</Field></div>
          <div className="md:col-span-3"><Field label="Content (Markdown)" required>{(p) => <Textarea {...p} rows={10} value={f.content} onChange={(e) => setF({ ...f, content: e.target.value })} />}</Field></div>
          <div className="flex gap-4"><Checkbox label="Businesses must accept" checked={f.business} onChange={(e) => setF({ ...f, business: e.target.checked })} /><Checkbox label="Creators must accept" checked={f.creator} onChange={(e) => setF({ ...f, creator: e.target.checked })} /></div>
          <div><Button type="submit">Save draft</Button></div>
        </form>
      </Card>
    </div>
  );
}
