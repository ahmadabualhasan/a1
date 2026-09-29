'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Field, Input, LoadingState } from '@codek/ui';
import { api, errorMessage } from '@/lib/api';
import type { SessionData } from '@/lib/session';
import { safeNext } from '@/lib/safe-next';

function SignInForm() {
  const router = useRouter();
  const params = useSearchParams();
  const qc = useQueryClient();
  const [form, setForm] = useState({ email: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
          const r = await api<{ status: string }>('/auth/sign-in', { method: 'POST', json: form });
          if (r.data.status === 'mfa_required') return router.push(`/mfa?next=${encodeURIComponent(params.get('next') ?? '')}`);
          await qc.invalidateQueries({ queryKey: ['/auth/session'] });
          const s = await api<SessionData>('/auth/session');
          const home = s.data.user.accountType === 'admin' ? '/admin' : s.data.user.accountType === 'business' ? '/business' : '/creator';
          router.push(safeNext(params.get('next')) ?? home);
        } catch (err) {
          setError(errorMessage(err));
        } finally {
          setBusy(false);
        }
      }}
    >
      <h1 className="text-xl font-semibold">Sign in</h1>
      <Field label="Email" required>{(p) => <Input {...p} type="email" autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />}</Field>
      <Field label="Password" required>{(p) => <Input {...p} type="password" autoComplete="current-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />}</Field>
      {error && <Alert tone="error">{error}</Alert>}
      <Button type="submit" loading={busy} className="w-full">Sign in</Button>
      <div className="flex justify-between text-sm">
        <Link className="text-brand-700" href="/forgot-password">Forgot password?</Link>
        <Link className="text-brand-700" href="/sign-up">Create account</Link>
      </div>
    </form>
  );
}

export default function SignInPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <SignInForm />
    </Suspense>
  );
}
