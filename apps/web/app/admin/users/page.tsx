'use client';
import { useState } from 'react';
import { Badge, DataTable, EmptyState, Input, PageHeader, Select, StatusBadge } from '@codek/ui';
import { ReasonButton, useRunner } from '@/components/admin';
import { DateText } from '@/components/format';
import { PagedList } from '@/components/paged';

interface User { id: string; email: string; name: string; accountType: string; status: string; emailVerified: boolean; twoFactorEnabled: boolean; createdAt: string; lastLoginAt: string | null; userRoles: Array<{ role: { name: string } }> }

export default function Users() {
  const [f, setF] = useState({ q: '', accountType: '', status: '' });
  const [role, setRole] = useState('support_agent');
  const { run, messages } = useRunner(['/admin/users', '/admin/actions']);
  return (
    <div className="space-y-6">
      <PageHeader
        title="Users"
        actions={
          <div className="flex flex-wrap gap-2">
            <label><span className="sr-only">Search</span><Input placeholder="Email or name" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} /></label>
            <label><span className="sr-only">Account type</span><Select value={f.accountType} onChange={(e) => setF({ ...f, accountType: e.target.value })} options={[{ value: '', label: 'All types' }, { value: 'business', label: 'Business' }, { value: 'creator', label: 'Creator' }, { value: 'admin', label: 'Admin' }]} /></label>
            <label><span className="sr-only">Status</span><Select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })} options={[{ value: '', label: 'All statuses' }, { value: 'active', label: 'Active' }, { value: 'suspended', label: 'Suspended' }]} /></label>
          </div>
        }
      />
      {messages}
      <PagedList<User> key={JSON.stringify(f)} path="/admin/users" params={f} empty={<EmptyState title="No users" />}>
        {(rows) => (
          <DataTable
            caption="Users"
            rowKey={(r) => r.id}
            rows={rows}
            columns={[
              { key: 'n', header: 'User', render: (r) => <span><span className="font-medium">{r.name}</span><br /><span className="text-xs text-slate-500">{r.email}</span></span> },
              { key: 't', header: 'Type', render: (r) => r.accountType },
              { key: 'r', header: 'Roles', render: (r) => <span className="flex flex-wrap gap-1">{r.userRoles.map((u) => <Badge key={u.role.name}>{u.role.name}</Badge>)}</span> },
              { key: 's', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
              { key: 'm', header: 'MFA', render: (r) => (r.twoFactorEnabled ? 'On' : 'Off') },
              { key: 'l', header: 'Last login', render: (r) => <DateText value={r.lastLoginAt} withTime /> },
              {
                key: 'a',
                header: '',
                render: (r) => (
                  <span className="flex flex-wrap gap-1">
                    {r.status === 'active' ? (
                      <ReasonButton label="Suspend" title={`Suspend ${r.email}?`} consequence="All their sessions end immediately and they cannot sign in." onReason={(reason) => run(`/admin/users/${r.id}/suspend`, { reason }, 'Suspended.')} />
                    ) : (
                      <ReasonButton variant="primary" label="Reactivate" title={`Reactivate ${r.email}?`} consequence="They can sign in again." onReason={(reason) => run(`/admin/users/${r.id}/reactivate`, { reason }, 'Reactivated.')} />
                    )}
                    <ReasonButton variant="secondary" label="Grant role" title={`Grant ${role} to ${r.email}?`} consequence={<span>Platform roles need a second administrator&apos;s approval. Role: <select aria-label="Role" className="rounded border px-1" value={role} onChange={(e) => setRole(e.target.value)}><option value="support_agent">Support agent</option><option value="finance_admin">Finance admin</option><option value="platform_admin">Platform admin</option></select></span>} onReason={(reason) => run(`/admin/users/${r.id}/roles`, { role, reason })} />
                    <ReasonButton label="Anonymize" title={`Anonymize ${r.email}?`} consequence="Personal data is removed; financial and audit history is kept as required. Needs a second administrator's approval. This cannot be undone." onReason={(reason) => run(`/admin/users/${r.id}/anonymize`, { reason })} />
                  </span>
                ),
              },
            ]}
          />
        )}
      </PagedList>
    </div>
  );
}
