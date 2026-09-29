/**
 * RBAC catalogue (spec §2, §13.4). Roles are seeded into the database from this single source.
 * Authorization pipeline: authentication → role/permission → object ownership/tenant → property level → state/business rules.
 */
export const PERMISSIONS = {
  // Business tenant permissions (scope: business membership)
  'business.profile.read': 'View business profile',
  'business.profile.update': 'Update business profile',
  'business.members.manage': 'Manage business team members',
  'catalog.read': 'View catalog',
  'catalog.manage': 'Create and edit catalog items',
  'campaign.read': 'View campaigns',
  'campaign.manage': 'Create, edit, publish, pause campaigns',
  'application.review': 'Review creator applications and send invitations',
  'partnership.read': 'View partnerships',
  'partnership.manage': 'Manage partnerships, deliverables and promotion assets',
  'conversion.read': 'View sales and conversions',
  'conversion.manage': 'Record redemptions and approve/reject conversions',
  'funding.read': 'View funding and obligations',
  'funding.manage': 'Fund obligations',
  'integration.manage': 'Connect and manage integrations',
  'analytics.read': 'View analytics and exports',
  'messaging.use': 'Use partnership messaging',
  'dispute.open': 'Open disputes',
  // Creator permissions (scope: own creator profile)
  'creator.profile.manage': 'Manage own creator profile and social accounts',
  'creator.marketplace.use': 'Browse marketplace and apply',
  'creator.partnership.use': 'Use own partnerships, assets, deliverables and messages',
  'creator.earnings.read': 'View own earnings',
  'creator.payout.request': 'Request payouts',
  // Platform/admin permissions
  'admin.access': 'Access the admin console',
  'admin.users.manage': 'Manage users',
  'admin.tenants.manage': 'Manage businesses and creators',
  'admin.campaigns.review': 'Review and moderate campaigns',
  'admin.verification.manage': 'Review verification cases',
  'admin.conversions.manage': 'Manage conversions and attribution',
  'admin.finance.read': 'View ledger and financial operations',
  'admin.finance.operate': 'Confirm funding, process payouts, request financial adjustments',
  'admin.finance.approve': 'Approve high-risk financial actions (second approver)',
  'admin.integrations.manage': 'Manage integrations and webhooks',
  'admin.reconciliation.manage': 'Run and resolve reconciliations',
  'admin.fraud.manage': 'Manage fraud flags and cases',
  'admin.disputes.manage': 'Manage disputes',
  'admin.moderation.manage': 'Moderate content and messages',
  'admin.audit.read': 'Read audit logs',
  'admin.legal.manage': 'Manage legal documents',
  'admin.settings.manage': 'Manage system settings and feature flags',
} as const;

export type Permission = keyof typeof PERMISSIONS;
export type RoleScope = 'platform' | 'business' | 'creator';

export interface RoleDefinition {
  name: string;
  scope: RoleScope;
  description: string;
  permissions: Permission[];
}

const BUSINESS_READ: Permission[] = [
  'business.profile.read',
  'catalog.read',
  'campaign.read',
  'partnership.read',
  'conversion.read',
  'funding.read',
  'analytics.read',
];

export const ROLE_DEFINITIONS: RoleDefinition[] = [
  {
    name: 'business_owner',
    scope: 'business',
    description: 'Owner of a business tenant with full business permissions',
    permissions: (Object.keys(PERMISSIONS) as Permission[]).filter(
      (p) => !p.startsWith('admin.') && !p.startsWith('creator.'),
    ),
  },
  {
    name: 'business_manager',
    scope: 'business',
    description: 'Manages campaigns, creators and conversions (no team or funding management)',
    permissions: [
      ...BUSINESS_READ,
      'catalog.manage',
      'campaign.manage',
      'application.review',
      'partnership.manage',
      'conversion.manage',
      'messaging.use',
      'dispute.open',
    ],
  },
  {
    name: 'business_viewer',
    scope: 'business',
    description: 'Read-only business access',
    permissions: [...BUSINESS_READ],
  },
  {
    name: 'creator',
    scope: 'creator',
    description: 'Creator account',
    permissions: [
      'creator.profile.manage',
      'creator.marketplace.use',
      'creator.partnership.use',
      'creator.earnings.read',
      'creator.payout.request',
      'messaging.use',
      'dispute.open',
    ],
  },
  {
    name: 'platform_admin',
    scope: 'platform',
    description: 'Full CODEK operations admin',
    permissions: (Object.keys(PERMISSIONS) as Permission[]).filter((p) => p.startsWith('admin.')),
  },
  {
    name: 'finance_admin',
    scope: 'platform',
    description: 'Financial operations and second approver',
    permissions: [
      'admin.access',
      'admin.finance.read',
      'admin.finance.operate',
      'admin.finance.approve',
      'admin.reconciliation.manage',
      'admin.audit.read',
    ],
  },
  {
    name: 'support_agent',
    scope: 'platform',
    description: 'Support and moderation without financial powers',
    permissions: [
      'admin.access',
      'admin.tenants.manage',
      'admin.campaigns.review',
      'admin.verification.manage',
      'admin.moderation.manage',
      'admin.disputes.manage',
      'admin.fraud.manage',
    ],
  },
];

export function roleByName(name: string): RoleDefinition | undefined {
  return ROLE_DEFINITIONS.find((r) => r.name === name);
}

export function roleHasPermission(roleName: string, permission: Permission): boolean {
  return !!roleByName(roleName)?.permissions.includes(permission);
}
