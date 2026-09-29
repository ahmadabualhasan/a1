'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { Alert, Button, Checkbox, Field, Input, LoadingState } from '@codek/ui';
import { CodekApiError, api, errorMessage, useApi } from '@/lib/api';

interface Doc { id: string; documentType: string; version: string; title: string }

function SignUpForm() {
  const params = useSearchParams();
  const [role, setRole] = useState<'business' | 'creator'>(params.get('role') === 'business' ? 'business' : 'creator');
  const docs = useApi<Doc[]>(`/auth/legal-requirements?role=${role}`);
  const [form, setForm] = useState({ displayName: '', email: '', password: '' });
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [done, setDone] = useState(false);
  if (done) {
    return (
      <div className="space-y-3">
        <h1 className="text-xl font-semibold">Check your email</h1>
        <p className="text-sm text-slate-600">We sent a confirmation link to <strong>{form.email}</strong>. Open it to activate your account, then sign in.</p>
        <Link className="text-sm font-medium text-brand-700 underline" href="/sign-in">Go to sign in</Link>
      </div>
    );
  }
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        setFieldErrors({});
        if (!accepted) return setError('Please accept the terms to continue.');
        if (form.password.length < 10) return setFieldErrors({ password: 'Use at least 10 characters.' });
        setBusy(true);
        try {
          await api('/auth/sign-up', { method: 'POST', json: { role, ...form, acceptedLegalDocumentIds: (docs.data?.data ?? []).map((d) => d.id) } });
          setDone(true);
        } catch (err) {
          if (err instanceof CodekApiError) setFieldErrors(err.fieldErrors);
          setError(errorMessage(err));
        } finally {
          setBusy(false);
        }
      }}
    >
      <h1 className="text-xl font-semibold">Create your account</h1>
      <fieldset>
        <legend className="mb-2 text-sm font-medium text-slate-800">I am a…</legend>
        <div className="grid grid-cols-2 gap-2">
          {(['creator', 'business'] as const).map((r) => (
            <label key={r} className={`cursor-pointer rounded-lg border p-3 text-center text-sm font-medium ${role === r ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-slate-300'}`}>
              <input type="radio" name="role" value={r} checked={role === r} onChange={() => setRole(r)} className="sr-only" />
              {r === 'creator' ? 'Creator' : 'Business'}
            </label>
          ))}
        </div>
      </fieldset>
      <Field label={role === 'business' ? 'Your name' : 'Display name'} required error={fieldErrors.displayName}>{(p) => <Input {...p} autoComplete="name" value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} />}</Field>
      <Field label="Email" required error={fieldErrors.email}>{(p) => <Input {...p} type="email" autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />}</Field>
      <Field label="Password" required hint="At least 10 characters" error={fieldErrors.password}>{(p) => <Input {...p} type="password" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />}</Field>
      {docs.isLoading ? (
        <LoadingState label="Loading terms…" />
      ) : (
        <Checkbox
          checked={accepted}
          onChange={(e) => setAccepted(e.target.checked)}
          label={
            <>
              I accept{' '}
              {(docs.data?.data ?? []).map((d, i, arr) => (
                <span key={d.id}>
                  <Link className="underline" href={d.documentType === 'privacy_policy' ? '/privacy' : '/terms'} target="_blank">{d.title}</Link> (v{d.version}){i < arr.length - 1 ? ', ' : ''}
                </span>
              ))}
            </>
          }
        />
      )}
      {error && <Alert tone="error">{error}</Alert>}
      <Button type="submit" loading={busy} className="w-full">Create account</Button>
      <p className="text-center text-sm text-slate-600">Already have an account? <Link className="font-medium text-brand-700" href="/sign-in">Sign in</Link></p>
    </form>
  );
}

export default function SignUpPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <SignUpForm />
    </Suspense>
  );
}
