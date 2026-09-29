'use client';
import type { ReactNode } from 'react';
import { AppShell } from '@/components/app-shell';
import { AreaGuard } from '@/components/area-guard';
import { CREATOR_NAV } from '@/components/navs';

export default function CreatorLayout({ children }: { children: ReactNode }) {
  return (
    <AreaGuard area="creator">
      <AppShell nav={CREATOR_NAV} title="Creator">{children}</AppShell>
    </AreaGuard>
  );
}
