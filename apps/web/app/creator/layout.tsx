import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { AppShell } from '@/components/app-shell';
import { AreaGuard } from '@/components/area-guard';
import { CREATOR_NAV } from '@/components/nav-config';

export const metadata: Metadata = { title: { absolute: 'CODEK Creator' }, robots: { index: false, follow: false } };

export default function CreatorLayout({ children }: { children: ReactNode }) {
  return (
    <AreaGuard area="creator">
      <AppShell nav={CREATOR_NAV} title="Creator">{children}</AppShell>
    </AreaGuard>
  );
}
