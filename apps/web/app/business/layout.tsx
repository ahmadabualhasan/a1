'use client';
import type { ReactNode } from 'react';
import { AppShell } from '@/components/app-shell';
import { AreaGuard } from '@/components/area-guard';
import { BUSINESS_NAV } from '@/components/navs';

export default function BusinessLayout({ children }: { children: ReactNode }) {
  return (
    <AreaGuard area="business">
      <AppShell nav={BUSINESS_NAV} title="Business">{children}</AppShell>
    </AreaGuard>
  );
}
