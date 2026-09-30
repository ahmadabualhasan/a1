'use client';
import type { ReactNode } from 'react';
import { AppShell } from '@/components/app-shell';
import { AreaGuard } from '@/components/area-guard';
import { ADMIN_NAV } from '@/components/navs';

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <AreaGuard area="admin">
      <AppShell nav={ADMIN_NAV} title="Admin">{children}</AppShell>
    </AreaGuard>
  );
}
