'use client';
import { EmptyState } from '@codek/ui';
import { QueryView } from '@/components/query-view';
import { useApi } from '@/lib/api';

interface Doc {
  id: string;
  documentType: string;
  version: string;
  title: string;
  publishedAt: string;
}

/** Renders the latest published version of a legal document from the API (versioned, spec §14.3). */
export function LegalDoc({ type }: { type: string }) {
  const list = useApi<Doc[]>('/legal/documents');
  const latest = list.data?.data.find((d) => d.documentType === type);
  const doc = useApi<Doc & { content: string }>(latest ? `/legal/documents/${latest.id}` : null);
  if (list.data && !latest) return <EmptyState title="Document not published yet" />;
  return (
    <QueryView query={doc}>
      {(d) => (
        <article className="mx-auto max-w-3xl px-4 py-14">
          <h1 className="text-3xl font-bold text-slate-900">{d.title}</h1>
          <p className="mt-2 text-sm text-slate-500">
            Version {d.version} · published {new Date(d.publishedAt).toLocaleDateString()}
          </p>
          <div className="mt-8 whitespace-pre-wrap text-slate-700">{d.content}</div>
        </article>
      )}
    </QueryView>
  );
}
