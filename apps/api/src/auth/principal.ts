import type { Permission } from '@codek/domain';

export interface BusinessAccess {
  businessId: string;
  role: string;
  permissions: Set<Permission>;
}

/** Authenticated caller resolved per request from the DB-backed session. */
export interface Principal {
  userId: string;
  sessionId: string;
  email: string;
  displayName: string;
  emailVerified: boolean;
  accountType: 'business' | 'creator' | 'admin';
  status: 'active' | 'suspended' | 'deleted';
  twoFactorEnabled: boolean;
  platformRoles: string[];
  platformPermissions: Set<Permission>;
  creatorId: string | null;
  creatorPermissions: Set<Permission>;
  businesses: Map<string, BusinessAccess>;
}

export type AuthedRequest = import('express').Request & { principal?: Principal };
