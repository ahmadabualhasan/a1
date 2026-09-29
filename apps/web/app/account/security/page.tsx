'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Alert, Button, Card, ConfirmButton, DataTable, Field, Input, PageHeader, Select } from '@codek/ui';
import { RoleShell } from '@/components/navs';
import { DateText } from '@/components/format';
import { QueryView } from '@/components/query-view';
import { api, errorMessage, useApi } from '@/lib/api';
import { useSession } from '@/lib/session';

interface SessionRow { id: string; createdAt: string; expiresAt: string; userAgent: string | null; current: boolean }

function Security() {
  const { session, refresh } = useSession();
  const sessions = useApi<SessionRow[]>('/auth/sessions');
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '' });
  const [msg, setMsg] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [mfa, setMfa] = useState<{ totpURI?: string; backupCodes?: string[] } | null>(null);
  const [mfaPassword, setMfaPassword] = useState('');
  const [code, setCode] = useState('');
  const [privacyType, setPrivacyType] = useState('access');
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setMsg(null);
    try {
      await fn();
      setMsg({ tone: 'success', text: ok });
    } catch (e) {
      setMsg({ tone: 'error', text: errorMessage(e) });
    }
  };
  const home = session?.user.accountType === 'admin' ? '/admin' : session?.user.accountType === 'business' ? '/business' : '/creator';
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="Account & security" back={<Link href={home} className="text-sm text-brand-700">← Back</Link>} />
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      <Card title="Password">
        <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); void run(() => api('/auth/change-password', { method: 'POST', json: { ...pw, revokeOtherSessions: true } }), 'Password changed. Other devices were signed out.'); }}>
          <Field label="Current password">{(p) => <Input {...p} type="password" autoComplete="current-password" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} />}</Field>
          <Field label="New password" hint="At least 10 characters">{(p) => <Input {...p} type="password" autoComplete="new-password" value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} />}</Field>
          <div><Button type="submit">Change password</Button></div>
        </form>
      </Card>
      <Card title="Two-step verification" description={session?.user.twoFactorEnabled ? 'Enabled' : 'Protect your account with an authenticator app. Required for CODEK staff.'}>
        {session?.user.twoFactorEnabled ? (
          <ConfirmButton label="Turn off" title="Turn off two-step verification?" consequence="Your account will only be protected by your password." requireReason={false} onConfirm={async () => { const p = window.prompt('Enter your password to confirm') ?? ''; await api('/auth/mfa/disable', { method: 'POST', json: { password: p } }); await refresh(); }} />
        ) : mfa ? (
          <div className="space-y-3 text-sm">
            <p>Add this key to your authenticator app, then enter the 6-digit code.</p>
            <code className="block break-all rounded bg-slate-100 p-2 text-xs">{mfa.totpURI}</code>
            <p className="font-medium">Backup codes (store them safely):</p>
            <ul className="grid grid-cols-2 gap-1 font-mono text-xs">{mfa.backupCodes?.map((c) => <li key={c}>{c}</li>)}</ul>
            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void run(async () => { await api('/auth/mfa/verify', { method: 'POST', json: { code } }); await refresh(); setMfa(null); }, 'Two-step verification is on.'); }}>
              <Input aria-label="Code" inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value)} />
              <Button type="submit">Confirm</Button>
            </form>
          </div>
        ) : (
          <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); void run(async () => { const r = await api<{ totpURI: string; backupCodes: string[] }>('/auth/mfa/enable', { method: 'POST', json: { password: mfaPassword } }); setMfa(r.data); }, 'Scan the key to continue.'); }}>
            <Field label="Password">{(p) => <Input {...p} type="password" value={mfaPassword} onChange={(e) => setMfaPassword(e.target.value)} />}</Field>
            <Button type="submit">Set up</Button>
          </form>
        )}
      </Card>
      <Card title="Signed-in devices" actions={<ConfirmButton label="Sign out other devices" variant="secondary" title="Sign out everywhere else?" consequence="All other browsers and devices will need to sign in again." onConfirm={async () => { await api('/auth/sessions/revoke-others', { method: 'POST', json: {} }); await sessions.refetch(); }} />}>
        <QueryView query={sessions}>
          {(rows) => <DataTable rowKey={(r) => r.id} rows={rows} columns={[{ key: 'ua', header: 'Device', render: (r) => (r.userAgent || 'Unknown').slice(0, 60) }, { key: 'c', header: 'Signed in', render: (r) => <DateText value={r.createdAt} withTime /> }, { key: 'cur', header: '', render: (r) => (r.current ? 'This device' : '') }]} />}
        </QueryView>
      </Card>
      <Card title="Privacy" description="Request a copy of your data, a correction or deletion. Deletion keeps records we must retain by law (for example payment history) in anonymized form.">
        <div className="flex flex-wrap items-end gap-2">
          <Button variant="secondary" onClick={async () => { const r = await api('/privacy/export'); const blob = new Blob([JSON.stringify(r.data, null, 2)], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'codek-my-data.json'; a.click(); }}>Download my data</Button>
          <Field label="Request type">{(p) => <Select {...p} value={privacyType} onChange={(e) => setPrivacyType(e.target.value)} options={[{ value: 'access', label: 'Access' }, { value: 'rectification', label: 'Correction' }, { value: 'deletion', label: 'Deletion' }, { value: 'portability', label: 'Portability' }]} />}</Field>
          <Button onClick={() => run(() => api('/privacy/requests', { method: 'POST', json: { requestType: privacyType } }), 'Request received. Our team will follow up.')}>Submit request</Button>
        </div>
      </Card>
    </div>
  );
}

export default function SecurityPage() {
  return (
    <RoleShell>
      <Security />
    </RoleShell>
  );
}
