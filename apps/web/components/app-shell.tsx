'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { cn } from '@codek/ui';
import { useApi } from '@/lib/api';
import { useSession } from '@/lib/session';

export interface NavItem {
  href: string;
  label: string;
}

/** Responsive shell: sidebar on desktop, collapsible menu on mobile. */
export function AppShell({ nav, title, children }: { nav: NavItem[]; title: string; children: ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const { session, signOut, businessId, setBusinessId } = useSession();
  const unread = useApi<{ unread: number }>(session ? '/notifications/unread-count' : null, { refetchInterval: 60_000 });
  const businesses = useApi<Array<{ id: string; displayName: string }>>(session?.user.accountType === 'business' ? '/businesses' : null);
  // Descriptive page titles for screen-reader and tab users (WCAG 2.4.2): "<section> · CODEK <area>". The area layout
  // provides the server-rendered title; after client navigations Next.js re-applies metadata titles, so the section
  // title is re-asserted whenever <head> changes. The first nav item (dashboard) only matches exactly.
  const section = nav
    .filter((n) => pathname === n.href || (n.href !== nav[0]?.href && pathname.startsWith(`${n.href}/`)))
    .sort((a, b) => b.href.length - a.href.length)[0];
  const sectionLabel = section?.label;
  useEffect(() => {
    const apply = () => {
      // Pages outside the area nav (notifications, disputes, account, onboarding) use their main heading.
      const label = sectionLabel ?? document.querySelector('#main h1')?.textContent?.trim() ?? title;
      const pageTitle = `${label} · CODEK ${title}`;
      if (document.title !== pageTitle) document.title = pageTitle;
    };
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.head, { subtree: true, childList: true, characterData: true });
    const main = document.getElementById('main');
    if (main) observer.observe(main, { subtree: true, childList: true });
    return () => observer.disconnect();
  }, [sectionLabel, title, pathname]);
  const links = (
    <ul className="space-y-1">
      {nav.map((n) => {
        const active = pathname === n.href || (n.href !== nav[0]?.href && pathname.startsWith(`${n.href}/`));
        return (
          <li key={n.href}>
            <Link href={n.href} onClick={() => setOpen(false)} aria-current={active ? 'page' : undefined} className={cn('block rounded-lg px-3 py-2 text-sm font-medium', active ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900')}>
              {n.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
  return (
    <div className="min-h-screen lg:flex">
      <aside className="hidden w-64 shrink-0 border-r border-slate-200 bg-white p-4 lg:block" aria-label={`${title} navigation`}>
        <Link href="/" className="mb-6 block text-lg font-bold tracking-tight text-brand-700">
          CODEK <span className="text-xs font-medium text-slate-500">{title}</span>
        </Link>
        <nav>{links}</nav>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3">
          <button type="button" className="rounded-md border px-3 py-1.5 text-sm lg:hidden" aria-expanded={open} aria-controls="mobile-nav" onClick={() => setOpen(!open)}>
            Menu
          </button>
          <div className="flex items-center gap-3">
            {businesses.data && businesses.data.data.length > 1 && (
              <label className="text-sm">
                <span className="sr-only">Business</span>
                <select className="rounded-md border px-2 py-1 text-sm" value={businessId ?? ''} onChange={(e) => setBusinessId(e.target.value)}>
                  {businesses.data.data.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.displayName}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <Link href="/notifications" className="relative rounded-md px-2 py-1 text-slate-600 hover:bg-slate-100">
              Notifications
              {!!unread.data?.data.unread && (
                <span className="ml-1 rounded-full bg-brand-600 px-1.5 py-0.5 text-xs text-white" aria-label={`${unread.data.data.unread} unread`}>
                  {unread.data.data.unread}
                </span>
              )}
            </Link>
            <Link href="/account/security" className="hidden text-slate-600 hover:text-slate-900 sm:inline">
              {session?.user.displayName}
            </Link>
            <button type="button" onClick={() => signOut()} className="rounded-md border px-3 py-1.5 text-slate-700 hover:bg-slate-50">
              Sign out
            </button>
          </div>
        </header>
        {open && (
          <nav id="mobile-nav" className="border-b border-slate-200 bg-white p-4 lg:hidden">
            {links}
          </nav>
        )}
        <main id="main" className="mx-auto w-full max-w-7xl flex-1 p-4 sm:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
