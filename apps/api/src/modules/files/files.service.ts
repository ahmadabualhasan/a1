import { Inject, Injectable } from '@nestjs/common';
import type { File, PrismaClient } from '@codek/database';
import { PRISMA } from '../../prisma/prisma.service';
import { AccessService } from '../../access/access.service';
import { notFound } from '../../common/errors';
import type { Principal } from '../../auth/principal';

/** Object-level read authorization for stored files by owner type. */
@Injectable()
export class FilesService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly access: AccessService,
  ) {}

  async assertCanRead(p: Principal, file: File): Promise<void> {
    if (file.visibility === 'public') return;
    if (p.platformPermissions.has('admin.moderation.manage') || p.platformPermissions.has('admin.disputes.manage')) return;
    switch (file.ownerType) {
      case 'partnership': {
        const ps = await this.prisma.partnership.findUnique({ where: { id: file.ownerId } });
        if (!ps) throw notFound('File');
        this.access.partnershipParty(p, ps);
        return;
      }
      case 'user':
        if (file.ownerId === p.userId) return;
        break;
      case 'business':
        if (p.businesses.has(file.ownerId)) return;
        break;
      case 'creator':
        if (p.creatorId === file.ownerId) return;
        break;
      case 'dispute': {
        const d = await this.prisma.dispute.findUnique({ where: { id: file.ownerId } });
        if (d && ((d.creatorId && d.creatorId === p.creatorId) || (d.businessId && p.businesses.has(d.businessId)))) return;
        break;
      }
    }
    throw notFound('File');
  }
}
