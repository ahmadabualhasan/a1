'use client';
import Link from 'next/link';
import { use, useState } from 'react';
import { Alert, Button, Card, DescriptionList, Field, Input, PageHeader, StatusBadge, Textarea } from '@codek/ui';
import { DateText } from '@/components/format';
import { RoleShell } from '@/components/navs';
import { QueryView } from '@/components/query-view';
import { errorMessage, useApi, useApiMutation } from '@/lib/api';

interface DisputeDetail {
  id: string;
  type: string;
  status: string;
  summary: string;
  partnershipId: string | null;
  conversionId: string | null;
  decisionCode: string | null;
  decisionReason: string | null;
  createdAt: string;
  closedAt: string | null;
  evidence: Array<{ id: string; description: string | null; externalUrl: string | null; fileId: string | null; createdAt: string }>;
  timeline: Array<{ action: string; reason: string | null; createdAt: string }>;
}

function Evidence({ id, closed }: { id: string; closed: boolean }) {
  const [f, setF] = useState({ description: '', externalUrl: '' });
  const add = useApiMutation<Record<string, unknown>>('POST', `/disputes/${id}/evidence`, { invalidate: [`/disputes/${id}`], onSuccess: () => setF({ description: '', externalUrl: '' }) });
  if (closed) return null;
  return (
    <Card title="Add evidence">
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); add.mutate({ description: f.description || undefined, externalUrl: f.externalUrl || undefined }); }}>
        <Field label="Description">{(p) => <Textarea {...p} rows={3} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />}</Field>
        <Field label="Link (optional)" hint="https:// link to a screenshot, receipt or post">{(p) => <Input {...p} type="url" value={f.externalUrl} onChange={(e) => setF({ ...f, externalUrl: e.target.value })} />}</Field>
        {add.error && <Alert tone="error">{errorMessage(add.error)}</Alert>}
        <Button type="submit" loading={add.isPending} disabled={!f.description && !f.externalUrl}>Add evidence</Button>
      </form>
    </Card>
  );
}

export default function DisputePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const q = useApi<DisputeDetail>(`/disputes/${id}`);
  return (
    <RoleShell>
      <div className="space-y-6">
        <Link href="/disputes" className="text-sm text-brand-700 underline">← All disputes</Link>
        <QueryView query={q}>
          {(d) => (
            <>
              <PageHeader title="Dispute" description={d.summary} actions={<StatusBadge status={d.status} />} />
              <div className="grid gap-6 lg:grid-cols-2">
                <Card title="Details">
                  <DescriptionList
                    items={[
                      { label: 'Type', value: d.type.replace(/_/g, ' ') },
                      { label: 'Opened', value: <DateText value={d.createdAt} withTime /> },
                      { label: 'Decision', value: d.decisionCode ? `${d.decisionCode.replace(/_/g, ' ')}${d.decisionReason ? ` — ${d.decisionReason}` : ''}` : 'Not decided yet' },
                      { label: 'Closed', value: <DateText value={d.closedAt} withTime /> },
                    ]}
                  />
                </Card>
                <Card title="History">
                  <ol className="space-y-2 border-l-2 border-slate-200 pl-4 text-sm">
                    {d.timeline.map((t, i) => (
                      <li key={i}><span className="font-medium">{t.action.replace('dispute.', '').replace(/_/g, ' ')}</span>{t.reason ? ` — ${t.reason}` : ''} <span className="text-slate-500"><DateText value={t.createdAt} withTime /></span></li>
                    ))}
                  </ol>
                </Card>
              </div>
              <Card title="Evidence">
                {d.evidence.length === 0 ? <p className="text-sm text-slate-500">No evidence yet.</p> : (
                  <ul className="space-y-2 text-sm">
                    {d.evidence.map((e) => (
                      <li key={e.id} className="rounded-lg bg-slate-50 p-3">
                        {e.description && <p className="whitespace-pre-wrap">{e.description}</p>}
                        {e.externalUrl && <a className="break-all text-brand-700 underline" href={e.externalUrl} target="_blank" rel="noopener noreferrer nofollow">{e.externalUrl}</a>}
                        {e.fileId && <a className="text-brand-700 underline" href={`/api/v1/files/${e.fileId}/download`}>Attachment</a>}
                        <p className="text-xs text-slate-500"><DateText value={e.createdAt} withTime /></p>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
              <Evidence id={d.id} closed={d.status === 'closed'} />
            </>
          )}
        </QueryView>
      </div>
    </RoleShell>
  );
}
