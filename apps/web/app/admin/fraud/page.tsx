'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Button, Card, DataTable, EmptyState, Field, Input, PageHeader, Select, StatusBadge, Tabs, Textarea } from '@codek/ui';
import { JsonBlock, ReasonButton, useRunner } from '@/components/admin';
import { DateText } from '@/components/format';
import { PagedList } from '@/components/paged';

interface Flag { id: string; businessId: string | null; subjectType: string; subjectId: string; signalType: string; severity: string; evidenceJson: unknown; status: string; fraudCaseId: string | null; createdAt: string }
interface FraudCase { id: string; subjectType: string; subjectId: string; status: string; riskLevel: string; summary: string; createdAt: string; _count: { flags: number } }

function Flags() {
  const [f, setF] = useState({ status: 'open', severity: '' });
  const [selected, setSelected] = useState<Flag[]>([]);
  const { run, messages } = useRunner(['/admin/fraud']);
  const [summary, setSummary] = useState('');
  const first = selected[0];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <label className="text-sm"><span className="sr-only">Status</span><Select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })} options={['open', 'reviewing', 'resolved', 'dismissed', ''].map((s) => ({ value: s, label: s || 'All' }))} /></label>
        <label className="text-sm"><span className="sr-only">Severity</span><Select value={f.severity} onChange={(e) => setF({ ...f, severity: e.target.value })} options={['', 'low', 'medium', 'high', 'critical'].map((s) => ({ value: s, label: s || 'All severities' }))} /></label>
      </div>
      {messages}
      {first && (
        <Card title={`Open a case for ${first.subjectType} ${first.subjectId.slice(0, 8)} (${selected.length} flag(s))`}>
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[20rem] flex-1"><Field label="Summary">{(p) => <Textarea {...p} rows={2} value={summary} onChange={(e) => setSummary(e.target.value)} />}</Field></div>
            <Button disabled={summary.trim().length < 10} onClick={async () => { await run('/admin/fraud/cases', { subjectType: first.subjectType, subjectId: first.subjectId, riskLevel: selected.some((s) => s.severity === 'critical') ? 'critical' : selected.some((s) => s.severity === 'high') ? 'high' : 'medium', summary, flagIds: selected.map((s) => s.id), businessId: first.businessId ?? undefined }, 'Case opened.'); setSelected([]); setSummary(''); }}>Open case</Button>
            <Button variant="ghost" onClick={() => setSelected([])}>Clear</Button>
          </div>
        </Card>
      )}
      <PagedList<Flag> key={JSON.stringify(f)} path="/admin/fraud/flags" params={f} empty={<EmptyState title="No flags" />}>
        {(rows) => (
          <DataTable caption="Fraud flags" rowKey={(r) => r.id} rows={rows} columns={[
            { key: 'c', header: '', render: (r) => (r.status === 'open' && !r.fraudCaseId ? <input type="checkbox" aria-label="Select flag" checked={selected.some((s) => s.id === r.id)} disabled={!!first && (first.subjectId !== r.subjectId)} onChange={(e) => setSelected(e.target.checked ? [...selected, r] : selected.filter((s) => s.id !== r.id))} /> : null) },
            { key: 'd', header: 'Raised', render: (r) => <DateText value={r.createdAt} withTime /> },
            { key: 't', header: 'Signal', render: (r) => r.signalType.replace(/_/g, ' ') },
            { key: 's', header: 'Subject', render: (r) => <span className="text-xs">{r.subjectType} <code>{r.subjectId.slice(0, 8)}</code></span> },
            { key: 'v', header: 'Severity', render: (r) => <StatusBadge status={r.severity} /> },
            { key: 'e', header: 'Evidence', render: (r) => <JsonBlock value={r.evidenceJson} /> },
            { key: 'st', header: 'Status', render: (r) => (r.fraudCaseId ? <Link className="text-brand-700 underline" href={`/admin/fraud/${r.fraudCaseId}`}>In case</Link> : <StatusBadge status={r.status} />) },
            { key: 'x', header: '', render: (r) => (r.status === 'open' ? <ReasonButton variant="secondary" label="Dismiss" title="Dismiss this flag?" consequence="Recorded in the audit log." onReason={(reason) => run(`/admin/fraud/flags/${r.id}/dismiss`, { reason }, 'Dismissed.')} /> : null) },
          ]} />
        )}
      </PagedList>
    </div>
  );
}

function Cases() {
  const [status, setStatus] = useState('');
  return (
    <div className="space-y-4">
      <label className="text-sm"><span className="sr-only">Status</span><Select value={status} onChange={(e) => setStatus(e.target.value)} options={['', 'open', 'evidence', 'review', 'decision', 'closed'].map((s) => ({ value: s, label: s || 'All' }))} /></label>
      <PagedList<FraudCase> key={status} path="/admin/fraud/cases" params={{ status }} empty={<EmptyState title="No cases" />}>
        {(rows) => (
          <DataTable caption="Fraud cases" rowKey={(r) => r.id} rows={rows} columns={[
            { key: 'd', header: 'Opened', render: (r) => <DateText value={r.createdAt} /> },
            { key: 's', header: 'Subject', render: (r) => <Link className="text-brand-700 hover:underline" href={`/admin/fraud/${r.id}`}>{r.subjectType} {r.subjectId.slice(0, 8)}</Link> },
            { key: 'r', header: 'Risk', render: (r) => <StatusBadge status={r.riskLevel} /> },
            { key: 'f', header: 'Flags', render: (r) => r._count.flags },
            { key: 'st', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
            { key: 'm', header: 'Summary', className: 'whitespace-normal max-w-md', render: (r) => r.summary },
          ]} />
        )}
      </PagedList>
    </div>
  );
}

function ManualCase() {
  const { run, messages } = useRunner(['/admin/fraud']);
  const [f, setF] = useState({ subjectType: 'creator', subjectId: '', riskLevel: 'medium', summary: '' });
  return (
    <Card title="Open a case manually">
      <form className="grid gap-3 md:grid-cols-4" onSubmit={(e) => { e.preventDefault(); void run('/admin/fraud/cases', f, 'Case opened.'); }}>
        <Field label="Subject type">{(p) => <Select {...p} value={f.subjectType} onChange={(e) => setF({ ...f, subjectType: e.target.value })} options={['creator', 'business', 'partnership', 'conversion', 'integration'].map((v) => ({ value: v, label: v }))} />}</Field>
        <Field label="Subject ID">{(p) => <Input {...p} value={f.subjectId} onChange={(e) => setF({ ...f, subjectId: e.target.value.trim() })} />}</Field>
        <Field label="Risk">{(p) => <Select {...p} value={f.riskLevel} onChange={(e) => setF({ ...f, riskLevel: e.target.value })} options={['low', 'medium', 'high', 'critical'].map((v) => ({ value: v, label: v }))} />}</Field>
        <div className="md:col-span-4"><Field label="Summary">{(p) => <Textarea {...p} rows={2} value={f.summary} onChange={(e) => setF({ ...f, summary: e.target.value })} />}</Field></div>
        <div><Button type="submit">Open case</Button></div>
      </form>
      <div className="mt-3">{messages}</div>
    </Card>
  );
}

export default function Fraud() {
  return (
    <div className="space-y-6">
      <PageHeader title="Fraud" description="Automated signals become flags; related flags are grouped into cases. High-risk cases hold payouts until decided." />
      <Tabs tabs={[{ id: 'f', label: 'Flags', content: <Flags /> }, { id: 'c', label: 'Cases', content: <Cases /> }, { id: 'n', label: 'New case', content: <ManualCase /> }]} />
    </div>
  );
}
