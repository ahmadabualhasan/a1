'use client';
import type { ReactNode } from 'react';
import { AppShell, type NavItem } from './app-shell';
import { AreaGuard } from './area-guard';
import { useSession } from '@/lib/session';

export const CREATOR_NAV: NavItem[] = [
  { href: '/creator', label: 'Dashboard' },
  { href: '/creator/marketplace', label: 'Find campaigns' },
  { href: '/creator/applications', label: 'Applications' },
  { href: '/creator/invitations', label: 'Invitations' },
  { href: '/creator/partnerships', label: 'Partnerships' },
  { href: '/creator/assets', label: 'Codes & links' },
  { href: '/creator/sales', label: 'Sales' },
  { href: '/creator/earnings', label: 'Earnings' },
  { href: '/creator/payouts', label: 'Payouts' },
  { href: '/creator/profile', label: 'Profile' },
  { href: '/disputes', label: 'Disputes' },
];

export const BUSINESS_NAV: NavItem[] = [
  { href: '/business', label: 'Dashboard' },
  { href: '/business/campaigns', label: 'Campaigns' },
  { href: '/business/catalog', label: 'Products & services' },
  { href: '/business/applications', label: 'Applications' },
  { href: '/business/creators', label: 'Find creators' },
  { href: '/business/partnerships', label: 'Partnerships' },
  { href: '/business/sales', label: 'Sales' },
  { href: '/business/funding', label: 'Funding' },
  { href: '/business/analytics', label: 'Analytics' },
  { href: '/business/integrations', label: 'Integrations' },
  { href: '/business/billing', label: 'Billing' },
  { href: '/business/settings', label: 'Business settings' },
  { href: '/disputes', label: 'Disputes' },
];

export const ADMIN_NAV: NavItem[] = [
  { href: '/admin', label: 'Overview' },
  { href: '/admin/approvals', label: 'Approvals' },
  { href: '/admin/verification', label: 'Verification' },
  { href: '/admin/users', label: 'Users' },
  { href: '/admin/businesses', label: 'Businesses' },
  { href: '/admin/creators', label: 'Creators' },
  { href: '/admin/campaigns', label: 'Campaigns' },
  { href: '/admin/conversions', label: 'Conversions' },
  { href: '/admin/finance', label: 'Ledger & payouts' },
  { href: '/admin/integrations', label: 'Integrations & webhooks' },
  { href: '/admin/fraud', label: 'Fraud' },
  { href: '/admin/disputes', label: 'Disputes' },
  { href: '/admin/moderation', label: 'Moderation' },
  { href: '/admin/audit', label: 'Audit log' },
  { href: '/admin/legal', label: 'Legal documents' },
  { href: '/admin/settings', label: 'Settings & pricing' },
  { href: '/admin/privacy', label: 'Privacy requests' },
];

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

export const DISPUTE_TYPES = [
  { value: 'attribution', label: 'Wrong creator credited for a sale' },
  { value: 'commission_amount', label: 'Commission amount is wrong' },
  { value: 'refund', label: 'Refund or cancellation' },
  { value: 'deliverable', label: 'Content / deliverable' },
  { value: 'payment', label: 'Payment or payout' },
  { value: 'other', label: 'Something else' },
];
