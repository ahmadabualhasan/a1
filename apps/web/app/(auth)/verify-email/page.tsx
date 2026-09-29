'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';
import { Alert, LoadingState } from '@codek/ui';
import { api, errorMessage } from '@/lib/api';

function Verify() {
  const token = useSearchParams().get('token');
  const [state, setState] = useState<'working' | 'ok' | 'error'>('working');
  const [msg, setMsg] = useState('');
  const ran = useRef(false);
  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    if (!token) {
      setState('error');
      setMsg('This link is missing its token.');
      return;
    }
    api('/auth/verify-email', { method: 'POST', json: { token } })
      .then(() => setState('ok'))
      .catch((e) => {
        setState('error');
        setMsg(errorMessage(e));
      });
  }, [token]);
  if (state === 'working') return <LoadingState label="Confirming your email…" />;
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Email confirmation</h1>
      {state === 'ok' ? <Alert tone="success">Your email is confirmed. You can now sign in.</Alert> : <Alert tone="error">{msg}</Alert>}
      <Link className="text-sm font-medium text-brand-700 underline" href="/sign-in">Go to sign in</Link>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <Verify />
    </Suspense>
  );
}
