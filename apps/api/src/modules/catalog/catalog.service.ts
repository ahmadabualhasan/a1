import { Inject, Injectable } from '@nestjs/common';
import type { Prisma, PrismaClient } from '@codek/database';
import { assertSupportedCurrency } from '@codek/domain';
import { PRISMA } from '../../prisma/prisma.service';
import { AccessService } from '../../access/access.service';
import { AuditService } from '../../audit/audit.service';
import { notFound } from '../../common/errors';
import { assertVersionUpdated } from '../../common/optimistic';
import { page } from '../../common/pagination';
import { slugify } from '../../common/validation';
import type { Principal } from '../../auth/principal';
import type { CatalogQueryDto, CreateCatalogItemDto, UpdateCatalogItemDto } from './catalog.dto';

@Injectable()
export class CatalogService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly access: AccessService,
    private readonly audit: AuditService,
  ) {}

  async list(p: Principal, businessId: string, q: CatalogQueryDto) {
    this.access.businessAccess(p, businessId, 'catalog.read');
    const where: Prisma.CatalogItemWhereInput = { businessId };
    if (q.active) where.active = q.active === 'true';
    if (q.q) where.name = { contains: q.q, mode: 'insensitive' };
    const [items, total] = await Promise.all([
      this.prisma.catalogItem.findMany({ where, orderBy: { createdAt: 'desc' }, take: q.limit, skip: q.offset }),
      this.prisma.catalogItem.count({ where }),
    ]);
    return page(items, total, q);
  }

  async get(p: Principal, businessId: string, id: string) {
    this.access.businessAccess(p, businessId, 'catalog.read');
    const item = await this.prisma.catalogItem.findFirst({ where: { id, businessId } });
    if (!item) throw notFound('Catalog item');
    return item;
  }

  async create(p: Principal, businessId: string, dto: CreateCatalogItemDto) {
    this.access.businessAccess(p, businessId, 'catalog.manage');
    if (dto.currency) assertSupportedCurrency(dto.currency);
    const slug = await this.uniqueSlug(businessId, dto.name);
    return this.prisma.$transaction(async (tx) => {
      const item = await tx.catalogItem.create({
        data: {
          businessId,
          name: dto.name,
          slug,
          type: dto.type,
          description: dto.description,
          category: dto.category,
          priceMinor: dto.priceMinor != null ? BigInt(dto.priceMinor) : null,
          currency: dto.currency,
          externalRef: dto.externalRef,
          mediaIds: dto.mediaIds ?? [],
        },
      });
      await this.audit.record({ actorUserId: p.userId, businessId, action: 'catalog.created', objectType: 'catalog_item', objectId: item.id, after: item }, tx);
      return item;
    });
  }

  async update(p: Principal, businessId: string, id: string, dto: UpdateCatalogItemDto) {
    this.access.businessAccess(p, businessId, 'catalog.manage');
    const before = await this.prisma.catalogItem.findFirst({ where: { id, businessId } });
    if (!before) throw notFound('Catalog item');
    if (dto.currency) assertSupportedCurrency(dto.currency);
    const { version, priceMinor, ...rest } = dto;
    return this.prisma.$transaction(async (tx) => {
      const r = await tx.catalogItem.updateMany({
        where: { id, businessId, version },
        data: { ...rest, ...(priceMinor !== undefined ? { priceMinor: BigInt(priceMinor) } : {}), version: { increment: 1 } },
      });
      assertVersionUpdated(r.count);
      const after = await tx.catalogItem.findUniqueOrThrow({ where: { id } });
      await this.audit.record({ actorUserId: p.userId, businessId, action: 'catalog.updated', objectType: 'catalog_item', objectId: id, before, after }, tx);
      return after;
    });
  }

  private async uniqueSlug(businessId: string, name: string): Promise<string> {
    const base = slugify(name);
    for (let i = 0; i < 100; i++) {
      const s = i === 0 ? base : `${base}-${i + 1}`;
      if (!(await this.prisma.catalogItem.findUnique({ where: { businessId_slug: { businessId, slug: s } }, select: { id: true } }))) return s;
    }
    return `${base}-${Date.now().toString(36)}`;
  }
}
