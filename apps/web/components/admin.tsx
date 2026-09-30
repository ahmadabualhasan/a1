'use client';
import { useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Alert, ConfirmButton } from '@codek/ui';
import { api, errorMessage } from '@/lib/api';

/** Runs an admin POST/PUT, surfaces errors, and refreshes every query whose path starts with one of `prefixes`. */
export function useRunner(prefixes: string[]) {
  const qc = useQueryClient();
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const run = async (path: string, body: Record<string, unknown> = {}, ok?: string, method: 'POST' | 'PUT' = 'POST') => {
    setErr(null);
    setInfo(null);
    try {
      const r = await api<Record<string, unknown>>(path, { method, json: body });
      const pending = (r.data as { approvalState?: string } | null)?.approvalState === 'pending';
      setInfo(pending ? 'Requested. A second administrator must approve this action before it takes effect.' : (ok ?? null));
      await qc.invalidateQueries({ predicate: (q) => prefixes.some((p) => String(q.queryKey[0]).startsWith(p)) });
      return r.data;
    } catch (e) {
      setErr(errorMessage(e));
      return null;
    }
  };
  const messages: ReactNode = (
    <>
      {err && <Alert tone="error">{err}</Alert>}
      {info && <Alert tone="success">{info}</Alert>}
    </>
  );
  return { run, messages };
}

/** A reason-required confirmation that posts `{ reason, ...extra }`. */
export function ReasonButton({ label, title, consequence, onReason, variant = 'danger' }: { label: string; title: string; consequence: ReactNode; onReason: (reason: string) => unknown; variant?: 'danger' | 'primary' | 'secondary' }) {
  return <ConfirmButton label={label} title={title} consequence={consequence} confirmLabel={label} variant={variant} requireReason onConfirm={onReason} />;
}

export function JsonBlock({ value }: { value: unknown }) {
  if (value == null) return <span className="text-slate-400">—</span>;
  return <pre className="max-h-64 max-w-xl overflow-auto whitespace-pre-wrap rounded bg-slate-50 p-2 text-xs">{JSON.stringify(value, null, 2)}</pre>;
}
