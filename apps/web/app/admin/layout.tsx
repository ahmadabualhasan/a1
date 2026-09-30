import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { AppShell } from '@/components/app-shell';
import { AreaGuard } from '@/components/area-guard';
import { ADMIN_NAV } from '@/components/nav-config';

export const metadata: Metadata = { title: { absolute: 'CODEK Admin' }, robots: { index: false, follow: false } };

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <AreaGuard area="admin">
      <AppShell nav={ADMIN_NAV} title="Admin">{children}</AppShell>
    </AreaGuard>
  );
}
