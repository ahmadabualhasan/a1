import Link from 'next/link';
import type { ReactNode } from 'react';

const links = [
  { href: '/how-it-works', label: 'How it works' },
  { href: '/for-businesses', label: 'For businesses' },
  { href: '/for-creators', label: 'For creators' },
  { href: '/marketplace', label: 'Campaigns' },
  { href: '/pricing', label: 'Pricing' },
];

export function PublicShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <header className="border-b border-slate-200">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-4">
          <Link href="/" className="text-xl font-bold tracking-tight text-brand-700">
            CODEK
          </Link>
          <nav aria-label="Main">
            <ul className="flex flex-wrap gap-4 text-sm text-slate-600">
              {links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="hover:text-slate-900">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <div className="flex gap-2 text-sm">
            <Link href="/sign-in" className="rounded-lg px-3 py-2 text-slate-700 hover:bg-slate-100">
              Sign in
            </Link>
            <Link href="/sign-up" className="rounded-lg bg-brand-600 px-3 py-2 font-medium text-white hover:bg-brand-700">
              Get started
            </Link>
          </div>
        </div>
      </header>
      <main id="main" className="flex-1">
        {children}
      </main>
      <footer className="border-t border-slate-200 bg-slate-50">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 py-10 text-sm text-slate-600 sm:grid-cols-4">
          <div>
            <p className="font-semibold text-slate-900">CODEK</p>
            <p className="mt-2">Creator–business partnerships with verified attribution and transparent payouts.</p>
          </div>
          <ul className="space-y-2">
            <li><Link href="/about">About</Link></li>
            <li><Link href="/resources">Resources</Link></li>
            <li><Link href="/case-studies">Case studies</Link></li>
          </ul>
          <ul className="space-y-2">
            <li><Link href="/faq">FAQ</Link></li>
            <li><Link href="/contact">Contact</Link></li>
          </ul>
          <ul className="space-y-2">
            <li><Link href="/terms">Terms</Link></li>
            <li><Link href="/privacy">Privacy</Link></li>
          </ul>
        </div>
      </footer>
    </div>
  );
}

export function Prose({ title, intro, children }: { title: string; intro?: string; children: ReactNode }) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-14">
      <h1 className="text-3xl font-bold tracking-tight text-slate-900">{title}</h1>
      {intro && <p className="mt-3 text-lg text-slate-600">{intro}</p>}
      <div className="mt-8 space-y-5 text-slate-700 [&_h2]:mt-8 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-slate-900 [&_li]:ml-5 [&_li]:list-disc">{children}</div>
    </div>
  );
}
