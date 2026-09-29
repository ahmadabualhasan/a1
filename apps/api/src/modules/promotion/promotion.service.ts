import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import QRCode from 'qrcode';
import type { Campaign, Creator, Partnership, PrismaClient, PromotionAssetStatus, TransactionClient } from '@codek/database';
import { assertTransition, assertValidCode, generateCodeCandidate, generateReferralToken, normalizeCode, PromotionAssetMachine, type PromotionAssetStatus as AssetStatus } from '@codek/domain';
import type { Env } from '@codek/config';
import { ENV } from '../../config/config.module';
import { PRISMA } from '../../prisma/prisma.service';
import { AccessService } from '../../access/access.service';
import { AuditService } from '../../audit/audit.service';
import { StorageService } from '../../storage/storage.service';
import { ApiError, notFound } from '../../common/errors';
import type { Principal } from '../../auth/principal';

interface PromotionRules {
  codeUsageLimit?: number;
  perCustomerLimit?: number;
  stackable?: boolean;
  codePrefix?: string;
}

/**
 * Promotion assets (spec §7): unique code, referral link and QR per partnership.
 * Codes are unique per business on their normalized form and never freed (DB unique index + no-delete trigger),
 * inserted with ON CONFLICT DO NOTHING so concurrent generation cannot collide or abort the transaction.
 */
@Injectable()
export class PromotionService {
  private readonly logger = new Logger('PromotionService');

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(ENV) private readonly env: Env,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
  ) {}

  trackingUrl(token: string, src?: 'qr'): string {
    return `${this.env.TRACKING_PUBLIC_URL.replace(/\/$/, '')}/r/${token}${src ? `?src=${src}` : ''}`;
  }

  /** Generate code + referral link + QR inside the partnership-creation transaction. */
  async generateForPartnership(
    tx: TransactionClient,
    partnership: Partnership,
    campaign: Campaign,
    creator: Creator,
    rules: PromotionRules,
    active: boolean,
  ): Promise<{ codeId: string; code: string; referralLinkId: string; token: string; qrAssetId: string }> {
    const status: PromotionAssetStatus = active ? 'active' : 'pending';
    const base = rules.codePrefix ? `${rules.codePrefix}${creator.handle}` : creator.handle;
    let code: { id: string; code: string } | null = null;
    for (let attempt = 0; attempt < 20 && !code; attempt++) {
      const candidate = generateCodeCandidate(base, attempt < 10 ? 4 : 6);
      code = await this.insertCode(tx, partnership, campaign, candidate, status, rules);
    }
    if (!code) throw new ApiError('CONFLICT', 'Could not allocate a unique promotion code, please retry');

    let link: { id: string; token: string } | null = null;
    const destination = campaign.destinationUrl ?? `${this.env.WEB_PUBLIC_URL.replace(/\/$/, '')}/offer`;
    const allowedHost = new URL(destination).hostname.toLowerCase();
    for (let attempt = 0; attempt < 10 && !link; attempt++) {
      const token = generateReferralToken(attempt < 5 ? 10 : 14);
      const id = randomUUID();
      const rows = await tx.$queryRaw<Array<{ id: string }>>`
        INSERT INTO referral_links (id, partnership_id, token, destination_url, allowed_host, status, created_at, updated_at)
        VALUES (${id}::uuid, ${partnership.id}::uuid, ${token}, ${destination}, ${allowedHost}, ${status}::"PromotionAssetStatus", now(), now())
        ON CONFLICT (token) DO NOTHING RETURNING id`;
      if (rows.length) link = { id, token };
    }
    if (!link) throw new ApiError('CONFLICT', 'Could not allocate a referral link, please retry');

    const qrUrl = this.trackingUrl(link.token, 'qr');
    const png = await QRCode.toBuffer(qrUrl, { type: 'png', errorCorrectionLevel: 'M', margin: 2, width: 512 });
    const fileId = randomUUID();
    const key = `qr/${partnership.businessId}/${partnership.id}/${fileId}.png`;
    const stored = await this.storage.put(key, png, 'image/png');
    await tx.file.create({
      data: { id: fileId, ownerType: 'partnership', ownerId: partnership.id, storageKey: key, mimeType: 'image/png', sizeBytes: BigInt(stored.size), checksum: stored.checksum, purpose: 'qr_asset', visibility: 'restricted' },
    });
    const qr = await tx.qrAsset.create({ data: { partnershipId: partnership.id, referralLinkId: link.id, assetFileId: fileId, encodedUrl: qrUrl, status: active ? 'active' : 'active' } });
    await tx.partnershipEvent.create({ data: { partnershipId: partnership.id, eventType: 'promotion_assets_generated', data: { code: code.code, referralToken: link.token } } });
    return { codeId: code.id, code: code.code, referralLinkId: link.id, token: link.token, qrAssetId: qr.id };
  }

  private async insertCode(tx: TransactionClient, p: Partnership, c: Campaign, candidate: string, status: PromotionAssetStatus, rules: PromotionRules) {
    const normalized = assertValidCode(candidate);
    const id = randomUUID();
    const rulesJson = JSON.stringify({ stackable: rules.stackable ?? false });
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      INSERT INTO promotion_codes (id, business_id, campaign_id, partnership_id, creator_id, code, normalized_code, status, starts_at, expires_at,
                                   usage_limit, per_customer_limit, usage_count, rules_json, version, created_at, updated_at)
      VALUES (${id}::uuid, ${p.businessId}::uuid, ${c.id}::uuid, ${p.id}::uuid, ${p.creatorId}::uuid, ${candidate}, ${normalized},
              ${status}::"PromotionAssetStatus", ${c.startAt}, ${c.endAt}, ${rules.codeUsageLimit ?? null}, ${rules.perCustomerLimit ?? null}, 0,
              ${rulesJson}::jsonb, 1, now(), now())
      ON CONFLICT (business_id, normalized_code) DO NOTHING RETURNING id`;
    return rows.length ? { id, code: candidate } : null;
  }

  /** Activate/pause/expire/revoke all assets of a partnership when its state changes. */
  async setPartnershipAssetsStatus(tx: TransactionClient, partnershipId: string, to: AssetStatus): Promise<void> {
    const from: AssetStatus[] = to === 'active' ? ['pending', 'paused'] : to === 'paused' ? ['active', 'pending'] : ['pending', 'active', 'paused'];
    await tx.promotionCode.updateMany({ where: { partnershipId, status: { in: from } }, data: { status: to, ...(to === 'revoked' ? { revokedAt: new Date() } : {}) } });
    await tx.referralLink.updateMany({ where: { partnershipId, status: { in: from } }, data: { status: to } });
    if (to === 'expired' || to === 'revoked') await tx.qrAsset.updateMany({ where: { partnershipId, status: 'active' }, data: { status: to } });
  }

  // ─────────────── API operations ───────────────

  async creatorAssets(p: Principal) {
    const creatorId = this.access.creatorId(p);
    const partnerships = await this.prisma.partnership.findMany({
      where: { creatorId },
      include: {
        campaign: { select: { id: true, name: true, status: true, endAt: true, customerDiscountConfig: true, disclosureRequirements: true } },
        business: { select: { id: true, displayName: true } },
        promotionCodes: { select: { id: true, code: true, status: true, startsAt: true, expiresAt: true, usageLimit: true, usageCount: true } },
        referralLinks: { select: { id: true, token: true, status: true } },
        qrAssets: { select: { id: true, status: true, assetFileId: true, encodedUrl: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return partnerships.map((ps) => ({
      partnershipId: ps.id,
      partnershipStatus: ps.status,
      campaign: ps.campaign,
      business: ps.business,
      codes: ps.promotionCodes,
      links: ps.referralLinks.map((l) => ({ ...l, url: this.trackingUrl(l.token) })),
      qrCodes: ps.qrAssets.map((q) => ({ ...q, downloadUrl: `/api/v1/files/${q.assetFileId}/download` })),
    }));
  }

  async changeCodeStatus(p: Principal, codeId: string, to: 'active' | 'paused' | 'revoked', reason: string) {
    const code = await this.prisma.promotionCode.findUnique({ where: { id: codeId }, include: { partnership: true, campaign: true } });
    if (!code) throw notFound('Promotion code');
    this.access.businessAccess(p, code.businessId, 'partnership.manage');
    assertTransition(PromotionAssetMachine, code.status as AssetStatus, to);
    if (to === 'active' && (code.partnership.status !== 'active' || code.campaign.status !== 'active')) {
      throw new ApiError('BUSINESS_RULE_VIOLATION', 'Codes can only be active while the partnership and campaign are active');
    }
    return this.prisma.$transaction(async (tx) => {
      const r = await tx.promotionCode.updateMany({ where: { id: codeId, status: code.status }, data: { status: to, version: { increment: 1 }, ...(to === 'revoked' ? { revokedAt: new Date(), revokeReason: reason } : {}) } });
      if (r.count === 0) throw new ApiError('VERSION_CONFLICT', 'The code changed concurrently, reload and retry');
      await this.audit.record({ actorUserId: p.userId, businessId: code.businessId, action: `promotion_code.${to}`, objectType: 'promotion_code', objectId: codeId, before: { status: code.status }, after: { status: to }, reason }, tx);
      await tx.partnershipEvent.create({ data: { partnershipId: code.partnershipId, eventType: `code_${to}`, actorUserId: p.userId, data: { code: code.code, reason } } });
      return tx.promotionCode.findUniqueOrThrow({ where: { id: codeId } });
    });
  }

  /** Scheduler: expire codes/links whose validity window ended. */
  async expireDue(now = new Date()): Promise<number> {
    const r = await this.prisma.promotionCode.updateMany({ where: { status: { in: ['pending', 'active', 'paused'] }, expiresAt: { lte: now } }, data: { status: 'expired' } });
    return r.count;
  }

  /** Validate a code at a point in time (redemption interface + attribution eligibility). */
  async resolveCode(businessId: string, rawCode: string) {
    const normalized = normalizeCode(rawCode);
    return this.prisma.promotionCode.findUnique({ where: { businessId_normalizedCode: { businessId, normalizedCode: normalized } }, include: { partnership: true, campaign: true } });
  }
}
