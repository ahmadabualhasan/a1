import type { ReactNode } from 'react';

/** Loading / empty / error / permission / success states required on every data screen (spec §17, §22.1). */
export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" className="flex items-center gap-3 rounded-xl border border-dashed border-slate-200 p-8 text-sm text-slate-500">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" aria-hidden="true" />
      {label}
    </div>
  );
}

export function EmptyState({ title, description, action }: { title: string; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
      <p className="text-sm font-medium text-slate-900">{title}</p>
      {description && <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">{description}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export function ErrorState({ title = 'Something went wrong', message, onRetry, requestId }: { title?: string; message?: string; onRetry?: () => void; requestId?: string | null }) {
  return (
    <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-800">
      <p className="font-medium">{title}</p>
      {message && <p className="mt-1">{message}</p>}
      {requestId && <p className="mt-2 text-xs text-red-600">Reference: {requestId}</p>}
      {onRetry && (
        <button type="button" onClick={onRetry} className="mt-3 text-sm font-medium underline underline-offset-2">
          Try again
        </button>
      )}
    </div>
  );
}

export function PermissionDenied({ message = 'You do not have access to this page.' }: { message?: string }) {
  return (
    <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
      <p className="font-medium">Access denied</p>
      <p className="mt-1">{message}</p>
    </div>
  );
}

export function Alert({ tone = 'info', children }: { tone?: 'info' | 'success' | 'warning' | 'error'; children: ReactNode }) {
  const cls = { info: 'border-sky-200 bg-sky-50 text-sky-900', success: 'border-emerald-200 bg-emerald-50 text-emerald-900', warning: 'border-amber-200 bg-amber-50 text-amber-900', error: 'border-red-200 bg-red-50 text-red-800' }[tone];
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={`rounded-lg border p-3 text-sm ${cls}`}>
      {children}
    </div>
  );
}
