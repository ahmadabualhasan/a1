import { Global, Injectable, Module } from '@nestjs/common';
import type { Permission } from '@codek/domain';
import { ApiError } from '../common/errors';
import type { BusinessAccess, Principal } from '../auth/principal';

/**
 * Object-level / tenant authorization helpers (spec §11, §20.9 steps 3-4). Every service method that touches
 * tenant data calls one of these with the resource's owning business/creator id loaded from the database —
 * never with an id taken only from the client.
 * Cross-tenant access returns NOT_FOUND (no existence disclosure); missing role permission inside an own tenant
 * returns FORBIDDEN.
 */
@Injectable()
export class AccessService {
  businessAccess(p: Principal, businessId: string, permission: Permission): BusinessAccess {
    const access = p.businesses.get(businessId);
    if (!access) throw new ApiError('NOT_FOUND', 'Business not found');
    if (!access.permissions.has(permission)) throw new ApiError('FORBIDDEN', 'Your role does not allow this action');
    return access;
  }

  isBusinessMember(p: Principal, businessId: string): boolean {
    return p.businesses.has(businessId);
  }

  /** Returns the caller's creator id, requiring a completed creator profile and the given creator permission. */
  creatorId(p: Principal, permission: Permission = 'creator.partnership.use'): string {
    if (p.accountType !== 'creator') throw new ApiError('FORBIDDEN', 'This action is available to creator accounts');
    if (!p.creatorPermissions.has(permission)) throw new ApiError('FORBIDDEN', 'Your account does not allow this action');
    if (!p.creatorId) throw new ApiError('BUSINESS_RULE_VIOLATION', 'Please complete your creator profile first', { next: 'creator_onboarding' });
    return p.creatorId;
  }

  requireAccountType(p: Principal, type: Principal['accountType']): void {
    if (p.accountType !== type) throw new ApiError('FORBIDDEN', `This action is available to ${type} accounts`);
  }

  platform(p: Principal, permission: Permission): void {
    if (!p.platformPermissions.has(permission)) throw new ApiError('FORBIDDEN', 'You do not have permission to perform this action');
  }

  /** Partnership participants: the creator, or a business member with the given permission. */
  partnershipParty(
    p: Principal,
    partnership: { businessId: string; creatorId: string },
    businessPermission: Permission = 'partnership.read',
  ): 'creator' | 'business' {
    if (p.creatorId && p.creatorId === partnership.creatorId) return 'creator';
    const b = p.businesses.get(partnership.businessId);
    if (b) {
      if (!b.permissions.has(businessPermission)) throw new ApiError('FORBIDDEN', 'Your role does not allow this action');
      return 'business';
    }
    throw new ApiError('NOT_FOUND', 'Partnership not found');
  }
}

@Global()
@Module({ providers: [AccessService], exports: [AccessService] })
export class AccessModule {}
