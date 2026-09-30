'use client';
import { useState } from 'react';
import { formatRate } from '@codek/api-client';
import { Alert, Badge, Button, Card, ConfirmButton, DescriptionList, EmptyState, Field, Input, StatusBadge, Tabs, Textarea } from '@codek/ui';
import { DateText, Money } from './format';
import { QueryView } from './query-view';
import { api, errorMessage, useApi, useApiMutation } from '@/lib/api';

export interface PartnershipDetail {
  id: string;
  status: string;
  viewerRole: 'creator' | 'business';
  businessId: string;
  campaign: { id: string; name: string; status: string; currency: string };
  business: { displayName: string };
  creator: { id: string; handle: string; displayName: string };
  promotionCodes: Array<{ id: string; code: string; status: string; usageCount: number }>;
  links: Array<{ id: string; token: string; status: string; url: string }>;
  qrAssets: Array<{ id: string; status: string; assetFileId: string }>;
  snapshots: Array<{ id: string; version: number; hash: string; acceptedAt: string; holdPeriodDays: number; commissionConfig: { type: string; rate: string | null; fixedMinor: number | null; baseType: string; includeTax: boolean; includeShipping: boolean; currency: string; refundBehavior: string }; attributionPolicy: { model: string; windowSeconds: number }; feePlanJson: { basis: string } }>;
  events: Array<{ id: string; eventType: string; createdAt: string }>;
}

export const PARTNERSHIP_STATUSES = [
  { value: '', label: 'All statuses' },
  { value: 'pending', label: 'Waiting for confirmation' },
  { value: 'active', label: 'Active' },
  { value: 'paused', label: 'Paused' },
  { value: 'completed', label: 'Completed' },
  { value: 'terminated', label: 'Terminated' },
  { value: 'cancelled', label: 'Cancelled' },
];

const EVENT_LABEL: Record<string, string> = {
  partnership_created: 'Partnership created',
  promotion_assets_generated: 'Code, link and QR generated',
  accepted: 'Terms confirmed',
  content_submitted: 'Content submitted',
  content_approved: 'Content approved',
  content_changes_requested: 'Changes requested',
  first_conversion: 'First sale',
  commission_approved: 'Commission approved',
  payout: 'Payout completed',
  partnership_paused: 'Paused',
  partnership_active: 'Resumed',
  partnership_completed: 'Completed',
  partnership_terminated: 'Terminated',
};

export function TermsCard({ p }: { p: PartnershipDetail }) {
  const s = p.snapshots[p.snapshots.length - 1];
  if (!s) return null;
  const c = s.commissionConfig;
  return (
    <Card title="Agreed terms" description={`Saved on ${new Date(s.acceptedAt).toLocaleDateString()} — later campaign changes do not affect these terms.`}>
      <DescriptionList
        items={[
          { label: 'Commission', value: c.type === 'percentage' ? `${formatRate(c.rate)} of the ${c.baseType === 'gross' ? 'order value' : c.baseType === 'net' ? 'net order value' : 'discounted order value'}` : <Money minor={c.fixedMinor} currency={c.currency} /> },
          { label: 'Tax / shipping', value: `${c.includeTax ? 'Tax counted' : 'Tax not counted'}, ${c.includeShipping ? 'shipping counted' : 'shipping not counted'}` },
          { label: 'Hold period', value: `${s.holdPeriodDays} days` },
          { label: 'Refunds', value: c.refundBehavior === 'clawback' ? 'Reduce commission, also after payout' : c.refundBehavior === 'reverse' ? 'Reduce unpaid commission' : 'No effect' },
          { label: 'Attribution', value: `${s.attributionPolicy.model.replace('_', ' ')} · ${Math.round(s.attributionPolicy.windowSeconds / 86400)}-day window` },
          { label: 'Terms fingerprint', value: <code className="text-xs">{s.hash.slice(0, 16)}…</code> },
        ]}
      />
    </Card>
  );
}

export function AssetsCard({ p }: { p: PartnershipDetail }) {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = async (v: string) => {
    await navigator.clipboard?.writeText(v).catch(() => undefined);
    setCopied(v);
  };
  return (
    <Card title="Promotion code, link & QR" description="Share the link online and the code or QR in person. Each is unique to this partnership.">
      <div className="space-y-4">
        {p.promotionCodes.map((c) => (
          <div key={c.id} className="flex flex-wrap items-center gap-3">
            <span className="rounded-lg bg-slate-100 px-3 py-2 font-mono text-lg font-semibold tracking-wider">{c.code}</span>
            <StatusBadge status={c.status} />
            <span className="text-sm text-slate-500">Used {c.usageCount} times</span>
            <Button size="sm" variant="secondary" onClick={() => copy(c.code)}>{copied === c.code ? 'Copied' : 'Copy code'}</Button>
          </div>
        ))}
        {p.links.map((l) => (
          <div key={l.id} className="flex flex-wrap items-center gap-3">
            <code className="break-all rounded bg-slate-100 px-2 py-1 text-sm">{l.url}</code>
            <StatusBadge status={l.status} />
            <Button size="sm" variant="secondary" onClick={() => copy(l.url)}>{copied === l.url ? 'Copied' : 'Copy link'}</Button>
          </div>
        ))}
        {p.qrAssets.map((q) => (
          <a key={q.id} className="inline-block text-sm font-medium text-brand-700 underline" href={`/api/v1/files/${q.assetFileId}/download`}>
            Download QR code (PNG)
          </a>
        ))}
      </div>
    </Card>
  );
}

interface Deliverable {
  id: string;
  type: string;
  description: string | null;
  dueAt: string | null;
  status: string;
  required: boolean;
  submissions: Array<{ id: string; url: string | null; fileId: string | null; caption: string | null; status: string; submittedAt: string; reviewNote: string | null }>;
}

export function DeliverablesPanel({ partnershipId, role }: { partnershipId: string; role: 'creator' | 'business' }) {
  const q = useApi<{ deliverables: Deliverable[]; contentRights: Array<{ ownership: string; organicAllowed: boolean; paidAdsAllowed: boolean; whitelistingAllowed: boolean; durationDays: number | null; territory: string | null }> }>(`/partnerships/${partnershipId}/deliverables`);
  return (
    <QueryView query={q}>
      {(d) => (
        <div className="space-y-4">
          {d.contentRights[0] && (
            <Alert tone="info">
              Content rights: owner {d.contentRights[0].ownership}; organic reuse {d.contentRights[0].organicAllowed ? 'yes' : 'no'}, paid ads {d.contentRights[0].paidAdsAllowed ? 'yes' : 'no'}, whitelisting {d.contentRights[0].whitelistingAllowed ? 'yes' : 'no'}
              {d.contentRights[0].durationDays ? `, for ${d.contentRights[0].durationDays} days` : ''}.
            </Alert>
          )}
          {d.deliverables.length === 0 && <EmptyState title="No deliverables for this partnership" />}
          {d.deliverables.map((dl) => (
            <DeliverableItem key={dl.id} d={dl} role={role} partnershipId={partnershipId} />
          ))}
        </div>
      )}
    </QueryView>
  );
}

function DeliverableItem({ d, role, partnershipId }: { d: Deliverable; role: 'creator' | 'business'; partnershipId: string }) {
  const [url, setUrl] = useState('');
  const [caption, setCaption] = useState('');
  const [note, setNote] = useState('');
  const inv = [`/partnerships/${partnershipId}/deliverables`];
  const submit = useApiMutation<{ url: string; caption?: string }>('POST', `/deliverables/${d.id}/submissions`, { invalidate: inv });
  const review = useApiMutation<{ id: string; decision: string; note?: string }>('POST', (b) => `/submissions/${b.id}/review`, { invalidate: inv });
  const latest = d.submissions[d.submissions.length - 1];
  const canSubmit = role === 'creator' && (d.status === 'not_started' || d.status === 'changes_requested');
  const canReview = role === 'business' && latest && ['submitted', 'resubmitted'].includes(latest.status);
  return (
    <Card title={d.type.replace(/_/g, ' ')} description={d.description ?? undefined} actions={<StatusBadge status={d.status} />}>
      <p className="text-sm text-slate-500">Due: <DateText value={d.dueAt} /> {d.required ? '' : '· optional'}</p>
      {d.submissions.map((s) => (
        <div key={s.id} className="mt-3 rounded-lg bg-slate-50 p-3 text-sm">
          <div className="flex flex-wrap items-center gap-2"><StatusBadge status={s.status} /> <DateText value={s.submittedAt} withTime /></div>
          {s.url && <a className="mt-1 block break-all text-brand-700 underline" href={s.url} target="_blank" rel="noopener noreferrer nofollow">{s.url}</a>}
          {s.caption && <p className="mt-1 text-slate-600">{s.caption}</p>}
          {s.reviewNote && <p className="mt-1 text-amber-800">Feedback: {s.reviewNote}</p>}
        </div>
      ))}
      {canSubmit && (
        <form className="mt-4 space-y-3" onSubmit={(e) => { e.preventDefault(); submit.mutate({ url, caption: caption || undefined }); }}>
          <Field label="Link to your published content" hint="https:// link to the post or video">{(p) => <Input {...p} type="url" required value={url} onChange={(e) => setUrl(e.target.value)} />}</Field>
          <Field label="Caption or note (optional)">{(p) => <Textarea {...p} rows={2} value={caption} onChange={(e) => setCaption(e.target.value)} />}</Field>
          {submit.error && <Alert tone="error">{errorMessage(submit.error)}</Alert>}
          <Button type="submit" loading={submit.isPending}>{d.status === 'changes_requested' ? 'Resubmit' : 'Submit content'}</Button>
        </form>
      )}
      {canReview && (
        <div className="mt-4 space-y-3">
          <Field label="Feedback (required to request changes)">{(p) => <Textarea {...p} rows={2} value={note} onChange={(e) => setNote(e.target.value)} />}</Field>
          {review.error && <Alert tone="error">{errorMessage(review.error)}</Alert>}
          <div className="flex gap-2">
            <Button loading={review.isPending} onClick={() => review.mutate({ id: latest.id, decision: 'approved', note: note || undefined })}>Approve</Button>
            <Button variant="secondary" loading={review.isPending} onClick={() => review.mutate({ id: latest.id, decision: 'changes_requested', note })}>Request changes</Button>
          </div>
        </div>
      )}
    </Card>
  );
}

interface Msg { id: string; body: string | null; messageType: string; fileId: string | null; createdAt: string; mine: boolean }

export function MessagesPanel({ partnershipId }: { partnershipId: string }) {
  const q = useApi<{ status: string; items: Msg[] }>(`/partnerships/${partnershipId}/messages`, { refetchInterval: 15_000 });
  const [text, setText] = useState('');
  const send = useApiMutation<{ body: string }>('POST', `/partnerships/${partnershipId}/messages`, { invalidate: [`/partnerships/${partnershipId}/messages`], onSuccess: () => setText('') });
  return (
    <QueryView query={q}>
      {(d) => (
        <div className="space-y-4">
          <ol className="max-h-[28rem] space-y-2 overflow-y-auto rounded-xl border border-slate-200 bg-white p-4" aria-live="polite">
            {d.items.length === 0 && <li className="text-sm text-slate-500">No messages yet. Say hello!</li>}
            {d.items.map((m) => (
              <li key={m.id} className={`flex ${m.mine ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${m.mine ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-900'}`}>
                  {m.body && <p className="whitespace-pre-wrap">{m.body}</p>}
                  {m.fileId && <a className="underline" href={`/api/v1/files/${m.fileId}/download`}>Attachment</a>}
                  <p className={`mt-1 text-[10px] ${m.mine ? 'text-brand-100' : 'text-slate-500'}`}>{new Date(m.createdAt).toLocaleString()}</p>
                  {!m.mine && (
                    <button type="button" className="mt-1 text-[10px] underline opacity-70" onClick={async () => { const reason = window.prompt('Why are you reporting this message?'); if (reason) await api(`/messages/${m.id}/report`, { method: 'POST', json: { reason } }); }}>
                      Report
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ol>
          {d.status === 'active' ? (
            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (text.trim()) send.mutate({ body: text }); }}>
              <label className="sr-only" htmlFor="msg">Message</label>
              <Input id="msg" value={text} maxLength={4000} onChange={(e) => setText(e.target.value)} placeholder="Write a message…" />
              <Button type="submit" loading={send.isPending}>Send</Button>
            </form>
          ) : (
            <Alert tone="info">This conversation is closed.</Alert>
          )}
          {send.error && <Alert tone="error">{errorMessage(send.error)}</Alert>}
        </div>
      )}
    </QueryView>
  );
}

export function Timeline({ events }: { events: PartnershipDetail['events'] }) {
  return (
    <ol className="space-y-3 border-l-2 border-slate-200 pl-4">
      {events.map((e) => (
        <li key={e.id} className="text-sm">
          <span className="font-medium text-slate-900">{EVENT_LABEL[e.eventType] ?? e.eventType.replace(/_/g, ' ')}</span>
          <span className="ml-2 text-slate-500"><DateText value={e.createdAt} withTime /></span>
        </li>
      ))}
    </ol>
  );
}

export function PartnershipView({ id, role, extraActions }: { id: string; role: 'creator' | 'business'; extraActions?: (p: PartnershipDetail, refetch: () => void) => React.ReactNode }) {
  const q = useApi<PartnershipDetail>(`/partnerships/${id}`);
  const confirm = useApiMutation<Record<string, never>>('POST', `/partnerships/${id}/confirm`, { invalidate: [`/partnerships/${id}`] });
  return (
    <QueryView query={q}>
      {(p) => (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm text-slate-500">{role === 'creator' ? p.business.displayName : `@${p.creator.handle}`}</p>
              <h1 className="text-2xl font-semibold">{p.campaign.name}</h1>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={p.status} />
              {extraActions?.(p, () => q.refetch())}
            </div>
          </div>
          {p.status === 'pending' && role === 'creator' && (
            <Alert tone="warning">
              The business updated the campaign terms after you applied. Review the terms below and confirm to start.{' '}
              <Button size="sm" loading={confirm.isPending} onClick={() => confirm.mutate({})}>Confirm terms</Button>
            </Alert>
          )}
          <Tabs
            tabs={[
              { id: 'overview', label: 'Overview', content: <div className="grid gap-6 lg:grid-cols-2"><AssetsCard p={p} /><TermsCard p={p} /></div> },
              { id: 'deliverables', label: 'Content', content: <DeliverablesPanel partnershipId={p.id} role={role} /> },
              { id: 'messages', label: 'Messages', content: <MessagesPanel partnershipId={p.id} /> },
              { id: 'timeline', label: 'Activity', content: <Card><Timeline events={p.events} /></Card> },
            ]}
          />
          <p className="text-xs text-slate-500">Something wrong with a sale or payment? <a className="underline" href={`/disputes?partnershipId=${p.id}`}>Open a dispute</a>.</p>
          <Badge>Partnership ID {p.id.slice(0, 8)}</Badge>
        </div>
      )}
    </QueryView>
  );
}

export { ConfirmButton };
