'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { Alert, Button, Field, Input, LoadingState } from '@codek/ui';
import { api, errorMessage } from '@/lib/api';

function Reset() {
  const token = useSearchParams().get('token') ?? '';
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [state, setState] = useState<{ ok?: boolean; error?: string }>({});
  const [busy, setBusy] = useState(false);
  if (state.ok) return <Alert tone="success">Password updated. <Link href="/sign-in" className="underline">Sign in</Link></Alert>;
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (pw !== pw2) return setState({ error: 'Passwords do not match.' });
        setBusy(true);
        try {
          await api('/auth/reset-password', { method: 'POST', json: { token, newPassword: pw } });
          setState({ ok: true });
        } catch (err) {
          setState({ error: errorMessage(err) });
        } finally {
          setBusy(false);
        }
      }}
    >
      <h1 className="text-xl font-semibold">Choose a new password</h1>
      <Field label="New password" required hint="At least 10 characters">{(p) => <Input {...p} type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />}</Field>
      <Field label="Repeat password" required>{(p) => <Input {...p} type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} />}</Field>
      {state.error && <Alert tone="error">{state.error}</Alert>}
      <Button type="submit" loading={busy} className="w-full">Update password</Button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <Reset />
    </Suspense>
  );
}
