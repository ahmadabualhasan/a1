import type { ReactNode } from 'react';

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  className?: string;
}

/** Responsive, accessible table; horizontally scrollable on small screens. */
export function DataTable<T>({ columns, rows, rowKey, caption, empty }: { columns: Array<Column<T>>; rows: T[]; rowKey: (row: T) => string; caption?: string; empty?: ReactNode }) {
  if (!rows.length && empty) return <>{empty}</>;
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead className="bg-slate-50">
          <tr>
            {columns.map((c) => (
              <th key={c.key} scope="col" className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r) => (
            <tr key={rowKey(r)} className="hover:bg-slate-50">
              {columns.map((c) => (
                <td key={c.key} className={`whitespace-nowrap px-4 py-3 text-slate-700 ${c.className ?? ''}`}>
                  {c.render(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Pagination({ total, limit, offset, onChange }: { total: number; limit: number; offset: number; onChange: (offset: number) => void }) {
  if (total <= limit) return null;
  const page = Math.floor(offset / limit) + 1;
  const pages = Math.ceil(total / limit);
  return (
    <nav aria-label="Pagination" className="mt-3 flex items-center justify-between text-sm text-slate-600">
      <span>
        Page {page} of {pages} · {total} results
      </span>
      <div className="flex gap-2">
        <button type="button" className="rounded border px-3 py-1 disabled:opacity-40" disabled={offset === 0} onClick={() => onChange(Math.max(0, offset - limit))}>
          Previous
        </button>
        <button type="button" className="rounded border px-3 py-1 disabled:opacity-40" disabled={offset + limit >= total} onClick={() => onChange(offset + limit)}>
          Next
        </button>
      </div>
    </nav>
  );
}
