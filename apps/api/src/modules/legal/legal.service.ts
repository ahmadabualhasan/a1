import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { PrismaClient } from '@codek/database';
import { PRISMA } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { ApiError, notFound } from '../../common/errors';
import { currentContext } from '../../common/request-context';
import type { Principal } from '../../auth/principal';

/** Versioned legal documents and acceptance records (spec §14.3): version, actor and timestamp are always recorded. */
@Injectable()
export class LegalService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly audit: AuditService,
  ) {}

  async published() {
    return this.prisma.legalDocument.findMany({ where: { status: 'published' }, select: { id: true, documentType: true, version: true, jurisdiction: true, title: true, requiredFor: true, publishedAt: true }, orderBy: [{ documentType: 'asc' }, { publishedAt: 'desc' }] });
  }

  async document(id: string) {
    const d = await this.prisma.legalDocument.findUnique({ where: { id } });
    if (!d || d.status === 'draft') throw notFound('Document');
    return d;
  }

  async pending(p: Principal) {
    if (p.accountType === 'admin') return [];
    const docs = await this.prisma.legalDocument.findMany({ where: { status: 'published', requiredFor: { has: p.accountType } }, orderBy: { publishedAt: 'desc' } });
    const latest = new Map<string, (typeof docs)[number]>();
    for (const d of docs) if (!latest.has(d.documentType)) latest.set(d.documentType, d);
    const accepted = new Set((await this.prisma.legalAcceptance.findMany({ where: { userId: p.userId }, select: { legalDocumentId: true } })).map((a) => a.legalDocumentId));
    return [...latest.values()].filter((d) => !accepted.has(d.id)).map((d) => ({ id: d.id, documentType: d.documentType, version: d.version, title: d.title }));
  }

  async accept(p: Principal, ids: string[], context = 'reacceptance') {
    const docs = await this.prisma.legalDocument.findMany({ where: { id: { in: ids }, status: 'published' } });
    if (docs.length !== new Set(ids).size) throw new ApiError('VALIDATION_FAILED', 'Unknown or unpublished document');
    const ctx = currentContext();
    await this.prisma.legalAcceptance.createMany({ data: docs.map((d) => ({ userId: p.userId, legalDocumentId: d.id, context, ipHash: ctx?.ipHash, userAgentHash: ctx?.userAgentHash, creatorId: p.creatorId })) });
    await this.audit.record({ actorUserId: p.userId, action: 'legal.accepted', objectType: 'user', objectId: p.userId, after: { documents: docs.map((d) => `${d.documentType}@${d.version}`) } });
    return { accepted: docs.length };
  }

  async adminList() {
    return this.prisma.legalDocument.findMany({ orderBy: [{ documentType: 'asc' }, { createdAt: 'desc' }], include: { _count: { select: { acceptances: true } } } });
  }

  async createDraft(p: Principal, dto: { documentType: string; version: string; jurisdiction?: string; title: string; content: string; requiredFor: string[] }) {
    const d = await this.prisma.legalDocument.create({
      data: { documentType: dto.documentType, version: dto.version, jurisdiction: dto.jurisdiction ?? null, title: dto.title, content: dto.content, contentHash: createHash('sha256').update(dto.content).digest('hex'), status: 'draft', requiredFor: dto.requiredFor },
    });
    await this.audit.record({ actorUserId: p.userId, actorType: 'admin', action: 'legal.draft_created', objectType: 'legal_document', objectId: d.id, after: { documentType: d.documentType, version: d.version } });
    return d;
  }

  /** Publishing retires the previous published version of the same type/jurisdiction; users must re-accept. */
  async publish(p: Principal, id: string) {
    const d = await this.prisma.legalDocument.findUnique({ where: { id } });
    if (!d) throw notFound('Document');
    if (d.status !== 'draft') throw new ApiError('INVALID_STATE_TRANSITION', 'Only drafts can be published');
    return this.prisma.$transaction(async (tx) => {
      await tx.legalDocument.updateMany({ where: { documentType: d.documentType, jurisdiction: d.jurisdiction, status: 'published' }, data: { status: 'retired' } });
      const pub = await tx.legalDocument.update({ where: { id }, data: { status: 'published', publishedAt: new Date() } });
      await this.audit.record({ actorUserId: p.userId, actorType: 'admin', action: 'legal.published', objectType: 'legal_document', objectId: id, after: { documentType: d.documentType, version: d.version, contentHash: d.contentHash } }, tx);
      return pub;
    });
  }
}
