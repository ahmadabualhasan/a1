'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { Alert, Button, Field, Input, LoadingState } from '@codek/ui';
import { api, errorMessage } from '@/lib/api';
import { safeNext } from '@/lib/safe-next';

function MfaForm() {
  const router = useRouter();
  const next = useSearchParams().get('next');
  const [code, setCode] = useState('');
  const [backup, setBackup] = useState(false);
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
          await api(backup ? '/auth/mfa/verify-backup-code' : '/auth/mfa/verify', { method: 'POST', json: { code } });
          window.location.href = safeNext(next) ?? '/';
        } catch (err) {
          setError(errorMessage(err));
        } finally {
          setBusy(false);
        }
      }}
    >
      <h1 className="text-xl font-semibold">Two-step verification</h1>
      <p className="text-sm text-slate-600">{backup ? 'Enter one of your backup codes.' : 'Enter the 6-digit code from your authenticator app.'}</p>
      <Field label={backup ? 'Backup code' : 'Code'} required>{(p) => <Input {...p} inputMode={backup ? 'text' : 'numeric'} autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value.trim())} />}</Field>
      {error && <Alert tone="error">{error}</Alert>}
      <Button type="submit" loading={busy} className="w-full">Verify</Button>
      <button type="button" className="text-sm text-brand-700" onClick={() => { setBackup(!backup); router.refresh(); }}>
        {backup ? 'Use authenticator code' : 'Use a backup code'}
      </button>
    </form>
  );
}

export default function MfaPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <MfaForm />
    </Suspense>
  );
}
