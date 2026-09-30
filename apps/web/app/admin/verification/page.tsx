'use client';
import { useState } from 'react';
import { Button, DataTable, EmptyState, Field, Input, PageHeader, Select, StatusBadge } from '@codek/ui';
import { JsonBlock, ReasonButton, useRunner } from '@/components/admin';
import { DateText } from '@/components/format';
import { QueryView } from '@/components/query-view';
import { useApi } from '@/lib/api';

interface VCase { id: string; subjectType: string; subjectId: string; status: string; evidenceJson: unknown; createdAt: string; resolvedAt: string | null; reasonCode: string | null }

export default function Verification() {
  const [status, setStatus] = useState('pending');
  const q = useApi<VCase[]>(`/admin/verification-cases?status=${status}`);
  const { run, messages } = useRunner(['/admin']);
  const [social, setSocial] = useState({ id: '', followerCount: '', evidence: '' });
  return (
    <div className="space-y-6">
      <PageHeader title="Verification" actions={<Select value={status} onChange={(e) => setStatus(e.target.value)} options={['pending', 'verified', 'rejected'].map((s) => ({ value: s, label: s }))} />} />
      {messages}
      <QueryView query={q} empty={<EmptyState title="No verification requests" />}>
        {(rows) => (
          <DataTable
            caption="Verification cases"
            rowKey={(r) => r.id}
            rows={rows}
            columns={[
              { key: 'd', header: 'Submitted', render: (r) => <DateText value={r.createdAt} withTime /> },
              { key: 't', header: 'Subject', render: (r) => <span>{r.subjectType} <code className="text-xs">{r.subjectId.slice(0, 8)}</code></span> },
              { key: 'e', header: 'Evidence', render: (r) => <JsonBlock value={r.evidenceJson} /> },
              { key: 's', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
              {
                key: 'a',
                header: '',
                render: (r) =>
                  r.status === 'pending' ? (
                    <span className="flex gap-1">
                      <ReasonButton variant="primary" label="Verify" title="Mark as verified?" consequence="The subject gets a verified badge." onReason={(reason) => run(`/admin/verification-cases/${r.id}/decide`, { decision: 'verified', reason }, 'Verified.')} />
                      <ReasonButton label="Reject" title="Reject verification?" consequence="The subject can request again later." onReason={(reason) => run(`/admin/verification-cases/${r.id}/decide`, { decision: 'rejected', reason }, 'Rejected.')} />
                    </span>
                  ) : null,
              },
            ]}
          />
        )}
      </QueryView>
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="font-semibold">Verify a social account&apos;s metrics</h2>
        <p className="text-sm text-slate-600">Record metrics you checked against the platform. Evidence is kept in the audit log.</p>
        <form className="mt-3 grid gap-3 md:grid-cols-4" onSubmit={(e) => { e.preventDefault(); void run(`/admin/social-accounts/${social.id}/verify`, { followerCount: social.followerCount ? Number.parseInt(social.followerCount, 10) : undefined, evidence: social.evidence }, 'Metrics verified.'); }}>
          <Field label="Social account ID">{(p) => <Input {...p} value={social.id} onChange={(e) => setSocial({ ...social, id: e.target.value })} />}</Field>
          <Field label="Followers">{(p) => <Input {...p} inputMode="numeric" value={social.followerCount} onChange={(e) => setSocial({ ...social, followerCount: e.target.value })} />}</Field>
          <Field label="Evidence">{(p) => <Input {...p} value={social.evidence} onChange={(e) => setSocial({ ...social, evidence: e.target.value })} />}</Field>
          <div className="flex items-end"><Button type="submit" disabled={!social.id || !social.evidence}>Verify metrics</Button></div>
        </form>
      </section>
    </div>
  );
}
