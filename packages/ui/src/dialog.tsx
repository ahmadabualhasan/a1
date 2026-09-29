'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Button } from './button';

/**
 * Destructive-action confirmation (spec §22.1): explains the consequence, optionally requires a reason.
 * Uses the native <dialog> element for focus trapping and Escape handling.
 */
export function ConfirmButton({
  label,
  title,
  consequence,
  confirmLabel = 'Confirm',
  variant = 'danger',
  requireReason = false,
  onConfirm,
  size = 'sm',
}: {
  label: ReactNode;
  title: string;
  consequence: ReactNode;
  confirmLabel?: string;
  variant?: 'danger' | 'primary' | 'secondary';
  requireReason?: boolean;
  onConfirm: (reason: string) => Promise<unknown> | unknown;
  size?: 'sm' | 'md';
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (open) ref.current?.showModal();
    else ref.current?.close();
  }, [open]);
  return (
    <>
      <Button variant={variant} size={size} onClick={() => setOpen(true)}>
        {label}
      </Button>
      <dialog ref={ref} onClose={() => setOpen(false)} className="w-full max-w-md rounded-xl p-0 shadow-xl backdrop:bg-slate-900/40" aria-labelledby="confirm-title">
        <form
          method="dialog"
          className="space-y-4 p-6"
          onSubmit={async (e) => {
            e.preventDefault();
            if (requireReason && reason.trim().length < 3) {
              setError('Please give a short reason.');
              return;
            }
            setBusy(true);
            setError(null);
            try {
              await onConfirm(reason.trim());
              setOpen(false);
              setReason('');
            } catch (err) {
              setError((err as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <h2 id="confirm-title" className="text-lg font-semibold text-slate-900">
            {title}
          </h2>
          <div className="text-sm text-slate-600">{consequence}</div>
          {requireReason && (
            <label className="block text-sm font-medium text-slate-800">
              Reason
              <textarea className="mt-1 block w-full rounded-lg border border-slate-300 p-2 text-sm" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
            </label>
          )}
          {error && (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant={variant === 'secondary' ? 'primary' : variant} loading={busy}>
              {confirmLabel}
            </Button>
          </div>
        </form>
      </dialog>
    </>
  );
}
