'use client';
import { useMutation, useQuery, useQueryClient, type UseQueryOptions } from '@tanstack/react-query';
import { api, CodekApiError, type Envelope } from '@codek/api-client';

export { api, CodekApiError, formatMoney, formatRate, toMinorUnits } from '@codek/api-client';

/** GET with caching; the query key is the path (+ params). */
export function useApi<T>(path: string | null, opts: Omit<UseQueryOptions<Envelope<T>, CodekApiError>, 'queryKey' | 'queryFn'> = {}) {
  return useQuery<Envelope<T>, CodekApiError>({
    queryKey: [path],
    queryFn: () => api<T>(path!),
    enabled: !!path && opts.enabled !== false,
    retry: (count, err) => err.status >= 500 && count < 2,
    ...opts,
  });
}

/** Mutation helper: invalidates the given paths (prefix match) on success. */
export function useApiMutation<TBody, TResult = unknown>(
  method: 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  path: string | ((body: TBody) => string),
  opts: { invalidate?: string[]; idempotent?: boolean; onSuccess?: (data: TResult) => void } = {},
) {
  const qc = useQueryClient();
  return useMutation<TResult, CodekApiError, TBody>({
    mutationFn: async (body: TBody) => {
      const url = typeof path === 'function' ? path(body) : path;
      const r = await api<TResult>(url, { method, json: method === 'DELETE' ? undefined : (body ?? {}), idempotencyKey: opts.idempotent ? crypto.randomUUID() : undefined });
      return r.data;
    },
    onSuccess: async (data) => {
      for (const p of opts.invalidate ?? []) await qc.invalidateQueries({ predicate: (q) => typeof q.queryKey[0] === 'string' && (q.queryKey[0] as string).startsWith(p) });
      opts.onSuccess?.(data);
    },
  });
}

export function errorMessage(err: unknown): string {
  if (err instanceof CodekApiError) {
    const problems = err.body.details?.problems as string[] | undefined;
    const reqs = err.body.details?.requirements as string[] | undefined;
    const extra = problems ?? reqs;
    return extra?.length ? `${err.message}: ${extra.join('; ')}` : err.message;
  }
  return 'Something went wrong. Please try again.';
}
