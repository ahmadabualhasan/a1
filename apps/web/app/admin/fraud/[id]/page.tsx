'use client';
import Link from 'next/link';
import { use, useState } from 'react';
import { Button, Card, Checkbox, DataTable, DescriptionList, Field, PageHeader, Select, StatusBadge, Textarea } from '@codek/ui';
import { JsonBlock, useRunner } from '@/components/admin';
import { DateText } from '@/components/format';
import { QueryView } from '@/components/query-view';
import { useApi } from '@/lib/api';

interface CaseDetail {
  id: string;
  subjectType: string;
  subjectId: string;
  status: string;
  riskLevel: string;
  summary: string;
  decisionReason: string | null;
  resolutionCode: string | null;
  createdAt: string;
  closedAt: string | null;
  flags: Array<{ id: string; signalType: string; severity: string; evidenceJson: unknown; status: string; createdAt: string }>;
  history: Array<{ seq: number; action: string; reason: string | null; createdAt: string; actorUserId: string | null }>;
}

const NEXT: Record<string, string[]> = { open: ['evidence', 'review', 'closed'], evidence: ['review'], review: ['decision', 'evidence'], decision: ['closed'], closed: [] };

export default function FraudCasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const q = useApi<CaseDetail>(`/admin/fraud/cases/${id}`);
  const { run, messages } = useRunner([`/admin/fraud`]);
  const [f, setF] = useState({ to: '', reason: '', resolutionCode: 'no_fraud', holdCommissions: false, releaseHolds: true });
  return (
    <div className="space-y-6">
      <Link href="/admin/fraud" className="text-sm text-brand-700 underline">← Fraud</Link>
      <QueryView query={q}>
        {(c) => (
          <>
            <PageHeader title={`Fraud case: ${c.subjectType} ${c.subjectId.slice(0, 8)}`} description={c.summary} actions={<StatusBadge status={c.status} />} />
            <div className="grid gap-6 lg:grid-cols-2">
              <Card title="Case">
                <DescriptionList items={[
                  { label: 'Risk', value: <StatusBadge status={c.riskLevel} /> },
                  { label: 'Subject ID', value: <code className="text-xs">{c.subjectId}</code> },
                  { label: 'Opened', value: <DateText value={c.createdAt} withTime /> },
                  { label: 'Decision', value: c.resolutionCode ? `${c.resolutionCode} — ${c.decisionReason ?? ''}` : '—' },
                ]} />
              </Card>
              {NEXT[c.status]!.length > 0 && (
                <Card title="Move case">
                  <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void run(`/admin/fraud/cases/${c.id}/transition`, { to: f.to, reason: f.reason, ...(f.to === 'decision' ? { resolutionCode: f.resolutionCode, holdCommissions: f.holdCommissions, releaseHolds: f.releaseHolds } : {}) }, 'Case updated.'); }}>
                    <Field label="Next step">{(p) => <Select {...p} value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} placeholder="Choose…" options={NEXT[c.status]!.map((s) => ({ value: s, label: s }))} />}</Field>
                    {f.to === 'decision' && (
                      <>
                        <Field label="Outcome">{(p) => <Select {...p} value={f.resolutionCode} onChange={(e) => setF({ ...f, resolutionCode: e.target.value })} options={[{ value: 'no_fraud', label: 'No fraud' }, { value: 'confirmed_fraud', label: 'Confirmed fraud' }, { value: 'inconclusive', label: 'Inconclusive' }]} />}</Field>
                        <Checkbox label="Hold the subject's unpaid commissions" checked={f.holdCommissions} onChange={(e) => setF({ ...f, holdCommissions: e.target.checked })} />
                        <Checkbox label="Release existing holds" checked={f.releaseHolds} onChange={(e) => setF({ ...f, releaseHolds: e.target.checked })} />
                      </>
                    )}
                    <Field label="Reason" required>{(p) => <Textarea {...p} rows={2} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} />}</Field>
                    <Button type="submit" disabled={!f.to || f.reason.trim().length < 3}>Update case</Button>
                  </form>
                  <div className="mt-3">{messages}</div>
                </Card>
              )}
            </div>
            <Card title="Flags">
              <DataTable caption="Flags in this case" rowKey={(r) => r.id} rows={c.flags} empty={<p className="text-sm text-slate-500">No flags linked.</p>} columns={[
                { key: 'd', header: 'Raised', render: (r) => <DateText value={r.createdAt} withTime /> },
                { key: 't', header: 'Signal', render: (r) => r.signalType },
                { key: 's', header: 'Severity', render: (r) => <StatusBadge status={r.severity} /> },
                { key: 'e', header: 'Evidence', render: (r) => <JsonBlock value={r.evidenceJson} /> },
              ]} />
            </Card>
            <Card title="History">
              <ol className="space-y-2 border-l-2 border-slate-200 pl-4 text-sm">
                {c.history.map((h) => <li key={String(h.seq)}><span className="font-medium">{h.action}</span>{h.reason ? ` — ${h.reason}` : ''} <span className="text-slate-500"><DateText value={h.createdAt} withTime /></span></li>)}
              </ol>
            </Card>
          </>
        )}
      </QueryView>
    </div>
  );
}
