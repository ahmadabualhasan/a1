'use client';
import { useState } from 'react';
import { Alert, Button, Field, Input } from '@codek/ui';
import { api } from '@/lib/api';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        await api('/auth/forgot-password', { method: 'POST', json: { email } }).catch(() => undefined);
        setSent(true);
        setBusy(false);
      }}
    >
      <h1 className="text-xl font-semibold">Reset your password</h1>
      {sent ? (
        <Alert tone="success">If an account exists for {email}, we sent a reset link. It expires in 1 hour.</Alert>
      ) : (
        <>
          <Field label="Email" required>{(p) => <Input {...p} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />}</Field>
          <Button type="submit" loading={busy} className="w-full">Send reset link</Button>
        </>
      )}
    </form>
  );
}
