'use client';
import type { ReactNode } from 'react';
import { AppShell } from './app-shell';
import { AreaGuard } from './area-guard';
import { ADMIN_NAV, BUSINESS_NAV, CREATOR_NAV } from './nav-config';
import { useSession } from '@/lib/session';

export { ADMIN_NAV, BUSINESS_NAV, CREATOR_NAV, DISPUTE_TYPES } from './nav-config';

/** Shell for pages shared by every signed-in account (notifications, disputes, account). */
export function RoleShell({ children }: { children: ReactNode }) {
  return (
    <AreaGuard area="any">
      <RoleShellInner>{children}</RoleShellInner>
    </AreaGuard>
  );
}

function RoleShellInner({ children }: { children: ReactNode }) {
  const { session } = useSession();
  const t = session?.user.accountType;
  const [nav, title] = t === 'creator' ? [CREATOR_NAV, 'Creator'] : t === 'business' ? [BUSINESS_NAV, 'Business'] : [ADMIN_NAV, 'Admin'];
  return <AppShell nav={nav} title={title}>{children}</AppShell>;
}
