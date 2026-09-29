import { Inject, Injectable } from '@nestjs/common';
import type { PrismaClient } from '@codek/database';
import type { Permission } from '@codek/domain';
import { PRISMA } from '../prisma/prisma.service';
import type { BusinessAccess, Principal } from './principal';

@Injectable()
export class PrincipalLoader {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  async load(userId: string, sessionId: string): Promise<Principal | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        userRoles: { include: { role: { include: { permissions: { include: { permission: true } } } } } },
        businessMemberships: {
          where: { status: 'active' },
          include: { role: { include: { permissions: { include: { permission: true } } } } },
        },
        creator: { select: { id: true } },
      },
    });
    if (!user) return null;
    const platformPermissions = new Set<Permission>();
    const creatorPermissions = new Set<Permission>();
    const platformRoles: string[] = [];
    for (const ur of user.userRoles) {
      const perms = ur.role.permissions.map((rp) => rp.permission.key as Permission);
      if (ur.role.scope === 'platform') {
        platformRoles.push(ur.role.name);
        perms.forEach((p) => platformPermissions.add(p));
      } else if (ur.role.scope === 'creator') {
        perms.forEach((p) => creatorPermissions.add(p));
      }
    }
    const businesses = new Map<string, BusinessAccess>();
    for (const m of user.businessMemberships) {
      businesses.set(m.businessId, {
        businessId: m.businessId,
        role: m.role.name,
        permissions: new Set(m.role.permissions.map((rp) => rp.permission.key as Permission)),
      });
    }
    return {
      userId: user.id,
      sessionId,
      email: user.email,
      displayName: user.name,
      emailVerified: user.emailVerified,
      accountType: user.accountType,
      status: user.status,
      twoFactorEnabled: user.twoFactorEnabled,
      platformRoles,
      platformPermissions,
      creatorId: user.creator?.id ?? null,
      creatorPermissions,
      businesses,
    };
  }
}
