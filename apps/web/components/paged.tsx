'use client';
import { useState, type ReactNode } from 'react';
import type { Envelope } from '@codek/api-client';
import { Pagination } from '@codek/ui';
import { QueryView } from './query-view';
import { useApi } from '@/lib/api';

/** Offset-paginated list (API `limit`/`offset`, totals in `meta.pagination`). */
export function PagedList<T>({ path, limit = 25, children, empty, params }: { path: string | null; limit?: number; children: (rows: T[]) => ReactNode; empty?: ReactNode; params?: Record<string, string | undefined> }) {
  const [offset, setOffset] = useState(0);
  const qs = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  for (const [k, v] of Object.entries(params ?? {})) if (v) qs.set(k, v);
  const q = useApi<T[]>(path ? `${path}${path.includes('?') ? '&' : '?'}${qs}` : null);
  return (
    <QueryView query={q} empty={empty}>
      {(rows, meta: Envelope<T[]>['meta']) => (
        <div className="space-y-3">
          {children(rows)}
          {meta.pagination && meta.pagination.total > limit && <Pagination total={meta.pagination.total} limit={limit} offset={offset} onChange={setOffset} />}
        </div>
      )}
    </QueryView>
  );
}
