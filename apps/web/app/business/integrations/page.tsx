'use client';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Card, ConfirmButton, DataTable, DescriptionList, EmptyState, Field, Input, LoadingState, PageHeader, Select, StatusBadge } from '@codek/ui';
import { DateText, Money } from '@/components/format';
import { QueryView } from '@/components/query-view';
import { api, errorMessage, useApi } from '@/lib/api';
import { useSession } from '@/lib/session';

interface Provider { provider: string; displayName: string; category: string; authMethods: string[] }
interface Integration { id: string; provider: string; displayName: string; environment: string; status: string; config: Record<string, unknown> | null; externalAccountRef: string | null; healthStatus: string | null; lastTestAt: string | null; lastTestResult: string | null; lastSuccessAt: string | null; lastErrorCode: string | null; webhookUrl: string; createdAt: string }
interface Health { last24h: Record<string, number>; rejectedSignaturesOrReplays24h: number; lastReconciliation: { id: string; status: string; startedAt: string; completedAt: string | null; summary: Record<string, unknown> | null } | null }
interface WebhookEvent { id: string; eventType: string | null; providerEventId: string | null; signatureValid: boolean; replayCheckPassed: boolean; processingState: string; retryCount: number; lastErrorCode: string | null; receivedAt: string }
interface Reconciliation { id: string; status: string; summaryJson: Record<string, unknown> | null; items: Array<{ id: string; entityType: string; externalRef: string | null; localAmountMinor: number | null; externalAmountMinor: number | null; currency: string | null; status: string; notes: string | null }> }

function Secret({ value, note }: { value: string; note: string }) {
  return (
    <Alert tone="warning">
      <p className="font-medium">{note}</p>
      <code className="mt-2 block break-all rounded bg-white px-2 py-1 font-mono text-sm">{value}</code>
    </Alert>
  );
}

function Connect({ businessId, providers, onSecret }: { businessId: string; providers: Provider[]; onSecret: (s: { value: string; note: string }) => void }) {
  const qc = useQueryClient();
  const [provider, setProvider] = useState(providers[0]?.provider ?? 'custom');
  const [f, setF] = useState({ displayName: '', systemType: 'website', shopDomain: '', webhookSecret: '', adminApiToken: '' });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setErr(null);
    setBusy(true);
    const body =
      provider === 'shopify'
        ? { businessId, displayName: f.displayName || undefined, config: { shopDomain: f.shopDomain }, credentials: { webhookSecret: f.webhookSecret, adminApiToken: f.adminApiToken || undefined } }
        : { businessId, displayName: f.displayName || undefined, config: { systemType: f.systemType }, credentials: {} };
    try {
      const r = await api<{ revealOnce: string | null; note: string | null }>(`/integrations/${provider}/connect`, { method: 'POST', json: body });
      if (r.data.revealOnce) onSecret({ value: r.data.revealOnce, note: r.data.note ?? 'Copy this secret now.' });
      setF({ ...f, webhookSecret: '', adminApiToken: '' });
      await qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith('/integrations') });
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card title="Connect a system" description="Connections start in test mode. Send a test event, then go live.">
      <form className="grid gap-3 md:grid-cols-2" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <Field label="System">{(p) => <Select {...p} value={provider} onChange={(e) => setProvider(e.target.value)} options={providers.map((x) => ({ value: x.provider, label: x.displayName }))} />}</Field>
        <Field label="Name (optional)">{(p) => <Input {...p} value={f.displayName} onChange={(e) => setF({ ...f, displayName: e.target.value })} />}</Field>
        {provider === 'shopify' ? (
          <>
            <Field label="Shop domain" required hint="your-store.myshopify.com">{(p) => <Input {...p} value={f.shopDomain} onChange={(e) => setF({ ...f, shopDomain: e.target.value })} />}</Field>
            <Field label="Webhook signing secret" required hint="From Shopify → Settings → Notifications → Webhooks">{(p) => <Input {...p} type="password" autoComplete="off" value={f.webhookSecret} onChange={(e) => setF({ ...f, webhookSecret: e.target.value })} />}</Field>
            <Field label="Admin API token (optional)" hint="Read-only orders access, used for reconciliation">{(p) => <Input {...p} type="password" autoComplete="off" value={f.adminApiToken} onChange={(e) => setF({ ...f, adminApiToken: e.target.value })} />}</Field>
          </>
        ) : (
          <Field label="System type">{(p) => <Select {...p} value={f.systemType} onChange={(e) => setF({ ...f, systemType: e.target.value })} options={['website', 'mobile_app', 'pos', 'booking', 'crm', 'other'].map((v) => ({ value: v, label: v.replace('_', ' ') }))} />}</Field>
        )}
        {err && <div className="md:col-span-2"><Alert tone="error">{err}</Alert></div>}
        <div><Button type="submit" loading={busy}>Connect</Button></div>
      </form>
    </Card>
  );
}

function IntegrationCard({ i, onSecret }: { i: Integration; onSecret: (s: { value: string; note: string }) => void }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [recon, setRecon] = useState<Reconciliation | null>(null);
  const [scope, setScope] = useState(() => ({ from: new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10), to: new Date().toISOString().slice(0, 10) }));
  const health = useApi<Health>(open ? `/integrations/${i.id}/health` : null);
  const events = useApi<WebhookEvent[]>(open ? `/integrations/${i.id}/webhook-events` : null);
  const run = async (action: string, ok?: string) => {
    setErr(null);
    setInfo(null);
    try {
      const r = await api<{ revealOnce?: string; note?: string; test?: { ok: boolean; detail: string } }>(`/integrations/${i.id}/${action}`, { method: 'POST', json: {} });
      if (r.data.revealOnce) onSecret({ value: r.data.revealOnce, note: r.data.note ?? 'Copy this secret now.' });
      if (r.data.test) setInfo(r.data.test.ok ? `Connection test passed: ${r.data.test.detail}` : `Connection test failed: ${r.data.test.detail}`);
      else if (ok) setInfo(ok);
      await qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith('/integrations') });
    } catch (e) {
      setErr(errorMessage(e));
    }
  };
  const reconcile = async () => {
    setErr(null);
    try {
      const r = await api<{ id: string }>(`/integrations/${i.id}/reconcile`, { method: 'POST', json: { scopeStart: new Date(`${scope.from}T00:00:00`).toISOString(), scopeEnd: new Date(`${scope.to}T23:59:59`).toISOString() } });
      const detail = await api<Reconciliation>(`/reconciliations/${r.data.id}`);
      setRecon(detail.data);
    } catch (e) {
      setErr(errorMessage(e));
    }
  };
  const s = i.status;
  return (
    <Card title={i.displayName} description={`${i.provider} · ${i.environment === 'live' ? 'Live' : 'Test mode'}${i.externalAccountRef ? ` · ${i.externalAccountRef}` : ''}`} actions={<StatusBadge status={s} />}>
      <DescriptionList
        items={[
          { label: 'Health', value: i.healthStatus?.replace(/_/g, ' ') ?? '—' },
          { label: 'Webhook URL', value: <code className="break-all text-xs">{i.webhookUrl}</code> },
          { label: 'Last test', value: i.lastTestAt ? <><DateText value={i.lastTestAt} withTime /> — {i.lastTestResult}</> : 'Never' },
          { label: 'Last event processed', value: <DateText value={i.lastSuccessAt} withTime /> },
          ...(i.lastErrorCode ? [{ label: 'Last error', value: i.lastErrorCode }] : []),
        ]}
      />
      {i.provider === 'custom' && s !== 'disconnected' && (
        <p className="mt-3 text-xs text-slate-500">
          Send order events as JSON POSTs to the webhook URL with headers X-Codek-Integration-Id: {i.id}, X-Codek-Event-Id, X-Codek-Timestamp and X-Codek-Signature (v1=HMAC-SHA256 of “timestamp.body” with your signing secret). Add X-Codek-Test: 1 for test events.
        </p>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        {['connected', 'testing', 'error'].includes(s) && <Button size="sm" variant="secondary" onClick={() => run('test')}>Run connection test</Button>}
        {s === 'testing' && <Button size="sm" onClick={() => run('go-live', 'Live. New events now create sales and commissions.')}>Go live</Button>}
        {s === 'live' && <ConfirmButton variant="secondary" label="Pause" title="Pause this integration?" consequence="Incoming events are stored but not processed until you resume." confirmLabel="Pause" onConfirm={() => run('pause')} />}
        {s === 'paused' && <Button size="sm" onClick={() => run('resume')}>Resume</Button>}
        {i.provider === 'custom' && s !== 'disconnected' && <ConfirmButton variant="secondary" label="Rotate secret" title="Rotate the signing secret?" consequence="The current secret stops working immediately. Update your system with the new secret." confirmLabel="Rotate" onConfirm={() => run('rotate-secret')} />}
        {s !== 'disconnected' && <ConfirmButton label="Disconnect" title="Disconnect this integration?" consequence="Events from this system will be rejected. Credentials are revoked. Past sales stay recorded." confirmLabel="Disconnect" onConfirm={() => run('disconnect')} />}
        <Button size="sm" variant="ghost" onClick={() => setOpen(!open)} aria-expanded={open}>{open ? 'Hide details' : 'Health & events'}</Button>
      </div>
      {err && <div className="mt-3"><Alert tone="error">{err}</Alert></div>}
      {info && <div className="mt-3"><Alert tone="info">{info}</Alert></div>}
      {open && (
        <div className="mt-4 space-y-4">
          <QueryView query={health}>
            {(h) => (
              <p className="text-sm text-slate-600">
                Last 24h: {Object.entries(h.last24h).map(([k, v]) => `${k.replace(/_/g, ' ')} ${v}`).join(', ') || 'no events'}. Rejected signatures/replays: {h.rejectedSignaturesOrReplays24h}.
                {h.lastReconciliation && <> Last reconciliation: {h.lastReconciliation.status} (<DateText value={h.lastReconciliation.startedAt} withTime />).</>}
              </p>
            )}
          </QueryView>
          <QueryView query={events} empty={<p className="text-sm text-slate-500">No events received yet.</p>}>
            {(rows) => (
              <DataTable
                caption="Recent webhook events"
                rowKey={(r) => r.id}
                rows={rows}
                columns={[
                  { key: 'd', header: 'Received', render: (r) => <DateText value={r.receivedAt} withTime /> },
                  { key: 't', header: 'Event', render: (r) => r.eventType ?? '—' },
                  { key: 'sig', header: 'Signature', render: (r) => (r.signatureValid && r.replayCheckPassed ? 'Valid' : 'Rejected') },
                  { key: 's', header: 'Processing', render: (r) => <StatusBadge status={r.processingState} /> },
                  { key: 'e', header: 'Error', render: (r) => r.lastErrorCode ?? '' },
                ]}
              />
            )}
          </QueryView>
          {i.provider === 'shopify' && (
            <div className="flex flex-wrap items-end gap-3">
              <Field label="From">{(p) => <Input {...p} type="date" value={scope.from} onChange={(e) => setScope({ ...scope, from: e.target.value })} />}</Field>
              <Field label="To">{(p) => <Input {...p} type="date" value={scope.to} onChange={(e) => setScope({ ...scope, to: e.target.value })} />}</Field>
              <Button size="sm" variant="secondary" onClick={reconcile}>Reconcile orders</Button>
            </div>
          )}
          {recon && (
            <div className="space-y-2">
              <p className="text-sm">Reconciliation <StatusBadge status={recon.status} /> {recon.items.length} difference(s).</p>
              {recon.items.length > 0 && (
                <DataTable
                  caption="Reconciliation differences"
                  rowKey={(r) => r.id}
                  rows={recon.items}
                  columns={[
                    { key: 'r', header: 'Order', render: (r) => r.externalRef ?? '—' },
                    { key: 's', header: 'Issue', render: (r) => <StatusBadge status={r.status} /> },
                    { key: 'l', header: 'CODEK', render: (r) => <Money minor={r.localAmountMinor} currency={r.currency} /> },
                    { key: 'x', header: 'Provider', render: (r) => <Money minor={r.externalAmountMinor} currency={r.currency} /> },
                    { key: 'n', header: 'Notes', className: 'whitespace-normal', render: (r) => r.notes ?? '' },
                  ]}
                />
              )}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

export default function IntegrationsPage() {
  const { businessId, can } = useSession();
  const providers = useApi<Provider[]>('/integrations/providers');
  const list = useApi<Integration[]>(businessId ? `/integrations?businessId=${businessId}` : null);
  const [secret, setSecret] = useState<{ value: string; note: string } | null>(null);
  if (!businessId) return <LoadingState />;
  return (
    <div className="space-y-6">
      <PageHeader title="Integrations" description="Connect your store, POS or booking system so sales are reported automatically and verified." />
      {secret && <Secret value={secret.value} note={secret.note} />}
      {can('integration.manage') && providers.data && <Connect businessId={businessId} providers={providers.data.data} onSecret={setSecret} />}
      <QueryView query={list} empty={<EmptyState title="No connected systems" description="You can still record sales by code at the counter from the Sales page." />}>
        {(rows) => <div className="grid gap-4 xl:grid-cols-2">{rows.map((i) => <IntegrationCard key={i.id} i={i} onSecret={setSecret} />)}</div>}
      </QueryView>
    </div>
  );
}
