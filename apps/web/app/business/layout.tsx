import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { AppShell } from '@/components/app-shell';
import { AreaGuard } from '@/components/area-guard';
import { BUSINESS_NAV } from '@/components/nav-config';

export const metadata: Metadata = { title: { absolute: 'CODEK Business' }, robots: { index: false, follow: false } };

export default function BusinessLayout({ children }: { children: ReactNode }) {
  return (
    <AreaGuard area="business">
      <AppShell nav={BUSINESS_NAV} title="Business">{children}</AppShell>
    </AreaGuard>
  );
}
