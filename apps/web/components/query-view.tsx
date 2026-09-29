'use client';
import type { ReactNode } from 'react';
import type { UseQueryResult } from '@tanstack/react-query';
import type { CodekApiError, Envelope } from '@codek/api-client';
import { EmptyState, ErrorState, LoadingState, PermissionDenied } from '@codek/ui';

/** Renders loading / permission denied / not found / error / empty / success for one API query. */
export function QueryView<T>({
  query,
  children,
  isEmpty,
  empty,
  loadingLabel,
}: {
  query: UseQueryResult<Envelope<T>, CodekApiError>;
  children: (data: T, meta: Envelope<T>['meta']) => ReactNode;
  isEmpty?: (data: T) => boolean;
  empty?: ReactNode;
  loadingLabel?: string;
}) {
  if (query.isLoading) return <LoadingState label={loadingLabel} />;
  if (query.error) {
    const e = query.error;
    if (e.status === 403) return <PermissionDenied message={e.message} />;
    if (e.status === 404) return <ErrorState title="Not found" message="This item does not exist or you do not have access to it." />;
    return <ErrorState message={e.message} requestId={e.body.requestId} onRetry={() => query.refetch()} />;
  }
  if (!query.data) return null;
  const data = query.data.data;
  const listEmpty = isEmpty ? isEmpty(data) : Array.isArray(data) && data.length === 0;
  if (listEmpty) return <>{empty ?? <EmptyState title="Nothing here yet" />}</>;
  return <>{children(data, query.data.meta)}</>;
}
