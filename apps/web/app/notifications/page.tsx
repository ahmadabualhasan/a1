'use client';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button, Card, Checkbox, DataTable, EmptyState, PageHeader, Tabs } from '@codek/ui';
import { DateText } from '@/components/format';
import { RoleShell } from '@/components/navs';
import { PagedList } from '@/components/paged';
import { QueryView } from '@/components/query-view';
import { api, useApi } from '@/lib/api';

interface Notification { id: string; type: string; title: string; body: string; dataJson: { link?: string | null } | null; readAt: string | null; createdAt: string }
interface Pref { type: string; description: string; inApp: boolean; email: boolean }

/** Only same-origin links are rendered (notification links are absolute URLs to the web app). */
function internalLink(link: string | null | undefined): string | null {
  if (!link) return null;
  try {
    const u = new URL(link, window.location.origin);
    return u.origin === window.location.origin ? `${u.pathname}${u.search}` : null;
  } catch {
    return null;
  }
}

function Inbox() {
  const qc = useQueryClient();
  const [unreadOnly, setUnreadOnly] = useState(false);
  const refresh = () => qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith('/notifications') });
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Checkbox label="Unread only" checked={unreadOnly} onChange={(e) => setUnreadOnly(e.target.checked)} />
        <Button size="sm" variant="secondary" onClick={async () => { await api('/notifications/read-all', { method: 'POST', json: {} }); await refresh(); }}>Mark all as read</Button>
      </div>
      <PagedList<Notification> key={String(unreadOnly)} path="/notifications" params={{ unreadOnly: unreadOnly ? 'true' : undefined }} empty={<EmptyState title="You're all caught up" />}>
        {(rows) => (
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
            {rows.map((n) => (
              <li key={n.id} className={`flex items-start justify-between gap-4 p-4 ${n.readAt ? '' : 'bg-brand-50/50'}`}>
                <div>
                  <p className="font-medium text-slate-900">{!n.readAt && <span className="sr-only">Unread: </span>}{n.title}</p>
                  <p className="text-sm text-slate-600">{n.body}</p>
                  <p className="mt-1 text-xs text-slate-500"><DateText value={n.createdAt} withTime /></p>
                  {internalLink(n.dataJson?.link) && <a className="text-sm text-brand-700 underline" href={internalLink(n.dataJson?.link)!}>Open</a>}
                </div>
                {!n.readAt && (
                  <Button size="sm" variant="ghost" onClick={async () => { await api(`/notifications/${n.id}/read`, { method: 'POST', json: {} }); await refresh(); }}>Mark read</Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </PagedList>
    </div>
  );
}

function Preferences() {
  const q = useApi<Pref[]>('/notification-preferences');
  const qc = useQueryClient();
  const set = async (p: Pref, patch: Partial<Pref>) => {
    await api(`/notification-preferences/${encodeURIComponent(p.type)}`, { method: 'PUT', json: { inApp: patch.inApp ?? p.inApp, email: patch.email ?? p.email } });
    await qc.invalidateQueries({ queryKey: ['/notification-preferences'] });
  };
  return (
    <Card title="Notification preferences" description="Security and payment notices are always sent.">
      <QueryView query={q}>
        {(rows) => (
          <DataTable
            caption="Notification preferences"
            rowKey={(r) => r.type}
            rows={rows}
            columns={[
              { key: 'd', header: 'Notification', className: 'whitespace-normal', render: (r) => r.description },
              { key: 'i', header: 'In app', render: (r) => <input type="checkbox" aria-label={`In-app: ${r.description}`} checked={r.inApp} onChange={(e) => set(r, { inApp: e.target.checked })} /> },
              { key: 'e', header: 'Email', render: (r) => <input type="checkbox" aria-label={`Email: ${r.description}`} checked={r.email} onChange={(e) => set(r, { email: e.target.checked })} /> },
            ]}
          />
        )}
      </QueryView>
    </Card>
  );
}

export default function NotificationsPage() {
  return (
    <RoleShell>
      <div className="space-y-6">
        <PageHeader title="Notifications" />
        <Tabs tabs={[{ id: 'inbox', label: 'Inbox', content: <Inbox /> }, { id: 'prefs', label: 'Preferences', content: <Preferences /> }]} />
      </div>
    </RoleShell>
  );
}
