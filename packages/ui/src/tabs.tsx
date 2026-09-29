'use client';
import { useId, useState, type ReactNode } from 'react';
import { cn } from './cn';

/** Accessible tabs (roving tabindex with arrow keys). */
export function Tabs({ tabs, initial }: { tabs: Array<{ id: string; label: string; content: ReactNode }>; initial?: string }) {
  const [active, setActive] = useState(initial && tabs.some((t) => t.id === initial) ? initial : tabs[0]?.id);
  const base = useId();
  return (
    <div>
      <div role="tablist" className="flex flex-wrap gap-1 border-b border-slate-200">
        {tabs.map((t, i) => (
          <button
            key={t.id}
            role="tab"
            id={`${base}-tab-${t.id}`}
            aria-selected={active === t.id}
            aria-controls={`${base}-panel-${t.id}`}
            tabIndex={active === t.id ? 0 : -1}
            onClick={() => setActive(t.id)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length]!;
                setActive(next.id);
                document.getElementById(`${base}-tab-${next.id}`)?.focus();
              }
            }}
            className={cn('-mb-px border-b-2 px-4 py-2 text-sm font-medium', active === t.id ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-800')}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tabs.map((t) => (
        <div key={t.id} role="tabpanel" id={`${base}-panel-${t.id}`} aria-labelledby={`${base}-tab-${t.id}`} hidden={active !== t.id} className="pt-5">
          {active === t.id && t.content}
        </div>
      ))}
    </div>
  );
}
