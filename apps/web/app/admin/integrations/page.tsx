'use client';
import { useState } from 'react';
import { Button, DataTable, EmptyState, Field, PageHeader, Select, StatusBadge, Tabs, Textarea } from '@codek/ui';
import { JsonBlock, useRunner } from '@/components/admin';
import { DateText, Money } from '@/components/format';
import { PagedList } from '@/components/paged';
import { QueryView } from '@/components/query-view';
import { useApi } from '@/lib/api';

interface Integration { id: string; businessId: string; provider: string; status: string; environment: string; healthStatus: string | null; lastSuccessAt: string | null; lastErrorCode: string | null; createdAt: string }
interface WebhookEvent { id: string; provider: string; businessId: string | null; eventType: string | null; providerEventId: string | null; signatureValid: boolean; replayCheckPassed: boolean; processingState: string; retryCount: number; lastErrorCode: string | null; lastErrorMessage: string | null; receivedAt: string }
interface Recon { id: string; kind: string; scopeStart: string; scopeEnd: string; status: string; startedAt: string; completedAt: string | null; summaryJson: unknown; integrationId: string | null }
interface ReconDetail { id: string; status: string; items: Array<{ id: string; entityType: string; externalRef: string | null; localAmountMinor: number | null; externalAmountMinor: number | null; currency: string | null; status: string; notes: string | null; resolution: string | null }> }

function Integrations() {
  const q = useApi<Integration[]>('/admin/integrations');
  return (
    <QueryView query={q} empty={<EmptyState title="No integrations" />}>
      {(rows) => (
        <DataTable caption="Integrations" rowKey={(r) => r.id} rows={rows} columns={[
          { key: 'p', header: 'Provider', render: (r) => r.provider },
          { key: 'b', header: 'Business', render: (r) => <code className="text-xs">{r.businessId.slice(0, 8)}</code> },
          { key: 's', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
          { key: 'e', header: 'Env', render: (r) => r.environment },
          { key: 'h', header: 'Health', render: (r) => r.healthStatus ?? '—' },
          { key: 'l', header: 'Last success', render: (r) => <DateText value={r.lastSuccessAt} withTime /> },
          { key: 'x', header: 'Last error', render: (r) => r.lastErrorCode ?? '' },
        ]} />
      )}
    </QueryView>
  );
}

function Events() {
  const [f, setF] = useState({ state: 'dead_letter', provider: '' });
  const { run, messages } = useRunner(['/admin/webhook-events']);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <label className="text-sm"><span className="sr-only">State</span><Select value={f.state} onChange={(e) => setF({ ...f, state: e.target.value })} options={['dead_letter', 'failed', 'received', 'queued', 'processing', 'processed', 'ignored', ''].map((s) => ({ value: s, label: s ? s.replace('_', ' ') : 'All' }))} /></label>
        <label className="text-sm"><span className="sr-only">Provider</span><Select value={f.provider} onChange={(e) => setF({ ...f, provider: e.target.value })} options={[{ value: '', label: 'All providers' }, { value: 'custom', label: 'custom' }, { value: 'shopify', label: 'shopify' }]} /></label>
      </div>
      {messages}
      <PagedList<WebhookEvent> key={JSON.stringify(f)} path="/admin/webhook-events" params={f} empty={<EmptyState title="No events" />}>
        {(rows) => (
          <DataTable caption="Webhook events" rowKey={(r) => r.id} rows={rows} columns={[
            { key: 'd', header: 'Received', render: (r) => <DateText value={r.receivedAt} withTime /> },
            { key: 'p', header: 'Provider / event', render: (r) => `${r.provider} ${r.eventType ?? ''}` },
            { key: 'sig', header: 'Signature', render: (r) => (r.signatureValid && r.replayCheckPassed ? 'Valid' : 'Rejected') },
            { key: 's', header: 'State', render: (r) => <StatusBadge status={r.processingState} /> },
            { key: 'n', header: 'Retries', render: (r) => r.retryCount },
            { key: 'e', header: 'Error', className: 'whitespace-normal max-w-xs', render: (r) => (r.lastErrorCode ? `${r.lastErrorCode}: ${r.lastErrorMessage ?? ''}` : '') },
            { key: 'x', header: '', render: (r) => (['dead_letter', 'failed'].includes(r.processingState) && r.signatureValid ? <Button size="sm" variant="secondary" onClick={() => run(`/admin/webhook-events/${r.id}/replay`, {}, 'Replayed from the stored raw payload.')}>Replay</Button> : null) },
          ]} />
        )}
      </PagedList>
    </div>
  );
}

function Reconciliations() {
  const [open, setOpen] = useState<string | null>(null);
  const detail = useApi<ReconDetail>(open ? `/reconciliations/${open}` : null);
  const { run, messages } = useRunner(['/reconciliations', '/admin/reconciliations', '/admin/overview']);
  const [res, setRes] = useState({ resolution: 'accepted_difference', note: '' });
  return (
    <div className="space-y-4">
      {messages}
      <PagedList<Recon> path="/admin/reconciliations" empty={<EmptyState title="No reconciliations yet" />}>
        {(rows) => (
          <DataTable caption="Reconciliations" rowKey={(r) => r.id} rows={rows} columns={[
            { key: 'd', header: 'Started', render: (r) => <DateText value={r.startedAt} withTime /> },
            { key: 'sc', header: 'Scope', render: (r) => <span className="text-xs">{r.kind}: <DateText value={r.scopeStart} /> – <DateText value={r.scopeEnd} /></span> },
            { key: 's', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
            { key: 'j', header: 'Summary', render: (r) => <JsonBlock value={r.summaryJson} /> },
            { key: 'x', header: '', render: (r) => <Button size="sm" variant="ghost" onClick={() => setOpen(open === r.id ? null : r.id)}>{open === r.id ? 'Hide' : 'Items'}</Button> },
          ]} />
        )}
      </PagedList>
      {open && (
        <QueryView query={detail}>
          {(d) => (
            <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
              <div className="grid gap-3 md:grid-cols-3">
                <Field label="Resolution">{(p) => <Select {...p} value={res.resolution} onChange={(e) => setRes({ ...res, resolution: e.target.value })} options={['accepted_difference', 'event_replayed', 'adjustment_requested', 'false_positive'].map((v) => ({ value: v, label: v.replace(/_/g, ' ') }))} />}</Field>
                <div className="md:col-span-2"><Field label="Note (required)">{(p) => <Textarea {...p} rows={1} value={res.note} onChange={(e) => setRes({ ...res, note: e.target.value })} />}</Field></div>
              </div>
              <DataTable caption="Reconciliation items" rowKey={(r) => r.id} rows={d.items} empty={<p className="text-sm text-slate-500">No differences.</p>} columns={[
                { key: 't', header: 'Type', render: (r) => r.entityType },
                { key: 'r', header: 'Reference', render: (r) => r.externalRef ?? '—' },
                { key: 's', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
                { key: 'l', header: 'CODEK', render: (r) => <Money minor={r.localAmountMinor} currency={r.currency} /> },
                { key: 'x', header: 'External', render: (r) => <Money minor={r.externalAmountMinor} currency={r.currency} /> },
                { key: 'n', header: 'Notes', className: 'whitespace-normal max-w-xs', render: (r) => r.resolution ? `Resolved: ${r.resolution}` : r.notes ?? '' },
                { key: 'a', header: '', render: (r) => (!r.resolution && r.status !== 'matched' ? <Button size="sm" disabled={res.note.trim().length < 3} onClick={() => run(`/admin/reconciliation-items/${r.id}/resolve`, res, 'Resolved.')}>Resolve</Button> : null) },
              ]} />
            </div>
          )}
        </QueryView>
      )}
    </div>
  );
}

export default function AdminIntegrations() {
  return (
    <div className="space-y-6">
      <PageHeader title="Integrations & webhooks" />
      <Tabs tabs={[{ id: 'e', label: 'Webhook events', content: <Events /> }, { id: 'i', label: 'Integrations', content: <Integrations /> }, { id: 'r', label: 'Reconciliations', content: <Reconciliations /> }]} />
    </div>
  );
}
