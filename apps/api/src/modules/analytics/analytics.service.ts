import { Inject, Injectable } from '@nestjs/common';
import type { PrismaClient } from '@codek/database';
import { PRISMA } from '../../prisma/prisma.service';
import { AccessService } from '../../access/access.service';
import type { Principal } from '../../auth/principal';

export const METRIC_DEFINITION_VERSION = 'analytics-v1';

export interface Range {
  from: Date;
  to: Date;
}

/** Row money helpers: postgres returns numeric/bigint sums; normalize to bigint. */
const big = (v: unknown): bigint => (v == null ? 0n : BigInt(String(v).split('.')[0]!));
const num = (v: unknown): number => Number(v ?? 0);

/**
 * Analytics (spec §15). Definitions are versioned (docs/ANALYTICS.md). Every response carries provenance and keeps
 * verified, self-reported, unattributed, conflicted, invalid and duplicate outcomes separate. Money totals come from
 * commission records and are cross-checked against the ledger. No customer PII is ever returned.
 */
@Injectable()
export class AnalyticsService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly access: AccessService,
  ) {}

  private provenance(range: Range) {
    return {
      source: 'CODEK conversion, attribution and financial records',
      metricDefinitionVersion: METRIC_DEFINITION_VERSION,
      attributionModel: 'Per-campaign policy frozen in each partnership (see attribution decision)',
      computedAt: new Date(),
      range,
      note: 'Tracking cannot capture every purchase; figures cover sales reported by connected systems and redemptions.',
    };
  }

  async businessOverview(p: Principal, businessId: string, range: Range) {
    this.access.businessAccess(p, businessId, 'analytics.read');
    const [convRows, decisionRows, clicks, visits, commissionRows, activeCampaigns, activeCreators, ledger] = await Promise.all([
      this.prisma.$queryRaw<Array<{ currency: string | null; verified_state: string; status: string; n: bigint; sales: string | null; refunded: string | null; attributed: bigint }>>`
        SELECT currency, verified_state, status, count(*)::bigint AS n,
               sum(coalesce(gross_minor,0) - coalesce(discount_minor,0))::text AS sales,
               sum(refunded_minor)::text AS refunded,
               count(*) FILTER (WHERE partnership_id IS NOT NULL)::bigint AS attributed
          FROM conversions WHERE business_id = ${businessId}::uuid AND occurred_at >= ${range.from} AND occurred_at < ${range.to}
         GROUP BY currency, verified_state, status`,
      this.prisma.$queryRaw<Array<{ decision_state: string; n: bigint }>>`
        SELECT d.decision_state, count(*)::bigint AS n FROM conversions c JOIN attribution_decisions d ON d.id = c.attribution_decision_id
         WHERE c.business_id = ${businessId}::uuid AND c.occurred_at >= ${range.from} AND c.occurred_at < ${range.to} GROUP BY d.decision_state`,
      this.prisma.trackingClick.count({ where: { businessId, occurredAt: { gte: range.from, lt: range.to }, suspected: false } }),
      this.prisma.trackingSession.count({ where: { businessId, firstTouchAt: { gte: range.from, lt: range.to } } }),
      this.prisma.$queryRaw<Array<{ currency: string; commission: string; fees: string; n: bigint }>>`
        SELECT cc.currency, sum(cc.commission_minor - cc.reversed_minor - cc.clawback_minor)::text AS commission, sum(cc.fee_minor - cc.fee_reversed_minor)::text AS fees, count(*)::bigint AS n
          FROM commission_calculations cc JOIN conversions c ON c.id = cc.conversion_id
         WHERE cc.business_id = ${businessId}::uuid AND c.occurred_at >= ${range.from} AND c.occurred_at < ${range.to}
         GROUP BY cc.currency`,
      this.prisma.campaign.count({ where: { businessId, status: 'active' } }),
      this.prisma.partnership.count({ where: { businessId, status: 'active' } }),
      this.ledgerCrossCheck(businessId),
    ]);

    const byCurrency = new Map<string, { currency: string; totalSalesMinor: bigint; creatorAttributedSalesMinor: bigint; refundedMinor: bigint; creatorCommissionsMinor: bigint; codekFeesMinor: bigint }>();
    const cur = (c: string) => {
      if (!byCurrency.has(c)) byCurrency.set(c, { currency: c, totalSalesMinor: 0n, creatorAttributedSalesMinor: 0n, refundedMinor: 0n, creatorCommissionsMinor: 0n, codekFeesMinor: 0n });
      return byCurrency.get(c)!;
    };
    const counts = { total: 0, verified: 0, selfReported: 0, unknown: 0, approved: 0, rejected: 0, cancelled: 0, refunded: 0 };
    for (const r of convRows) {
      const n = num(r.n);
      counts.total += n;
      if (r.verified_state === 'verified') counts.verified += n;
      else if (r.verified_state === 'self_reported') counts.selfReported += n;
      else counts.unknown += n;
      if (r.status === 'approved' || r.status === 'partially_refunded') counts.approved += n;
      if (r.status === 'rejected') counts.rejected += n;
      if (r.status === 'cancelled') counts.cancelled += n;
      if (r.status === 'refunded') counts.refunded += n;
      if (!r.currency || ['rejected', 'cancelled', 'reversed'].includes(r.status)) continue;
      // "Sales" count verified outcomes only; self-reported amounts are reported separately below.
      if (r.verified_state !== 'verified') continue;
      const row = cur(r.currency);
      row.totalSalesMinor += big(r.sales);
      row.refundedMinor += big(r.refunded);
    }
    const attributedSales = await this.prisma.$queryRaw<Array<{ currency: string; sales: string }>>`
      SELECT currency, sum(coalesce(gross_minor,0) - coalesce(discount_minor,0))::text AS sales FROM conversions
       WHERE business_id = ${businessId}::uuid AND occurred_at >= ${range.from} AND occurred_at < ${range.to} AND partnership_id IS NOT NULL
         AND verified_state = 'verified' AND status NOT IN ('rejected','cancelled','reversed') AND currency IS NOT NULL GROUP BY currency`;
    for (const r of attributedSales) cur(r.currency).creatorAttributedSalesMinor = big(r.sales);
    for (const r of commissionRows) {
      const row = cur(r.currency);
      row.creatorCommissionsMinor = big(r.commission);
      row.codekFeesMinor = big(r.fees);
    }
    const decisions = Object.fromEntries(decisionRows.map((d) => [d.decision_state, num(d.n)]));
    const attributedCount = decisions.attributed ?? 0;
    return {
      kpis: { activeCampaigns, activeCreators, clicks, trackedVisits: visits, conversions: counts, attribution: { attributed: attributedCount, unattributed: decisions.unattributed ?? 0, conflicted: decisions.conflicted ?? 0, invalid: decisions.invalid ?? 0, duplicate: decisions.duplicate ?? 0 } },
      money: [...byCurrency.values()],
      funnel: {
        impressions: null,
        clicks,
        trackedVisits: visits,
        conversions: attributedCount,
        approvedConversions: counts.approved,
        conversionRate: clicks > 0 ? (attributedCount / clicks).toFixed(4) : null,
        note: 'Impressions are not available from connected platforms.',
      },
      ledgerCheck: ledger,
      provenance: this.provenance(range),
    };
  }

  /**
   * Analytics must not contradict the ledger (spec §15.4): the business's outstanding commission obligations derived
   * from commission records must equal merchant_receivable + funded-but-unreleased amounts in the ledger.
   */
  async ledgerCrossCheck(businessId: string) {
    const rows = await this.prisma.$queryRaw<Array<{ currency: string; from_commissions: string; from_ledger: string }>>`
      WITH c AS (
        SELECT currency, sum(commission_minor - reversed_minor - clawback_minor + fee_minor - fee_reversed_minor)::numeric AS amt
          FROM commission_calculations WHERE business_id = ${businessId}::uuid AND status IN ('pending','approved') GROUP BY currency
      ), l AS (
        SELECT a.currency, sum(CASE WHEN li.direction = 'debit' THEN li.amount_minor ELSE -li.amount_minor END)::numeric AS amt
          FROM ledger_accounts a JOIN ledger_entry_lines li ON li.ledger_account_id = a.id
         WHERE a.owner_type = 'business' AND a.owner_key = ${businessId} AND a.account_type = 'merchant_receivable' GROUP BY a.currency
      )
      SELECT coalesce(c.currency, l.currency) AS currency, coalesce(c.amt, 0)::text AS from_commissions, coalesce(l.amt, 0)::text AS from_ledger
        FROM c FULL OUTER JOIN l ON l.currency = c.currency`;
    const checks = rows.map((r) => ({ currency: r.currency, obligationsFromCommissionsMinor: big(r.from_commissions), merchantReceivableFromLedgerMinor: big(r.from_ledger), consistent: big(r.from_commissions) === big(r.from_ledger) }));
    return { consistent: checks.every((c) => c.consistent), checks };
  }

  /** Active creator table (spec §5.3). */
  async creatorTable(p: Principal, businessId: string, range: Range) {
    this.access.businessAccess(p, businessId, 'analytics.read');
    const rows = await this.prisma.$queryRaw<Array<{ partnership_id: string; creator_id: string; handle: string; display_name: string; campaign_id: string; campaign: string; status: string; code: string | null; clicks: bigint; conversions: bigint; currency: string | null; sales: string | null; commission: string | null }>>`
      SELECT p.id AS partnership_id, cr.id AS creator_id, cr.handle, cr.display_name, ca.id AS campaign_id, ca.name AS campaign, p.status,
             (SELECT code FROM promotion_codes pc WHERE pc.partnership_id = p.id ORDER BY created_at LIMIT 1) AS code,
             (SELECT count(*) FROM tracking_clicks tc WHERE tc.partnership_id = p.id AND tc.suspected = false AND tc.occurred_at >= ${range.from} AND tc.occurred_at < ${range.to})::bigint AS clicks,
             (SELECT count(*) FROM conversions cv WHERE cv.partnership_id = p.id AND cv.verified_state = 'verified' AND cv.status NOT IN ('rejected','cancelled','reversed') AND cv.occurred_at >= ${range.from} AND cv.occurred_at < ${range.to})::bigint AS conversions,
             ca.currency,
             (SELECT sum(coalesce(gross_minor,0) - coalesce(discount_minor,0)) FROM conversions cv WHERE cv.partnership_id = p.id AND cv.verified_state = 'verified' AND cv.status NOT IN ('rejected','cancelled','reversed') AND cv.occurred_at >= ${range.from} AND cv.occurred_at < ${range.to})::text AS sales,
             (SELECT sum(cc.commission_minor - cc.reversed_minor - cc.clawback_minor) FROM commission_calculations cc JOIN conversions cv ON cv.id = cc.conversion_id WHERE cc.partnership_id = p.id AND cv.occurred_at >= ${range.from} AND cv.occurred_at < ${range.to})::text AS commission
        FROM partnerships p JOIN creators cr ON cr.id = p.creator_id JOIN campaigns ca ON ca.id = p.campaign_id
       WHERE p.business_id = ${businessId}::uuid
       ORDER BY p.created_at DESC LIMIT 500`;
    return {
      items: rows.map((r) => ({
        partnershipId: r.partnership_id,
        creator: { id: r.creator_id, handle: r.handle, displayName: r.display_name },
        campaign: { id: r.campaign_id, name: r.campaign },
        status: r.status,
        code: r.code,
        clicks: num(r.clicks),
        conversions: num(r.conversions),
        currency: r.currency,
        salesMinor: big(r.sales),
        commissionMinor: big(r.commission),
        conversionRate: num(r.clicks) > 0 ? (num(r.conversions) / num(r.clicks)).toFixed(4) : null,
      })),
      provenance: this.provenance(range),
    };
  }

  async campaignTable(p: Principal, businessId: string, range: Range) {
    this.access.businessAccess(p, businessId, 'analytics.read');
    const rows = await this.prisma.$queryRaw<Array<{ id: string; name: string; status: string; currency: string; partnerships: bigint; clicks: bigint; conversions: bigint; sales: string | null; commission: string | null }>>`
      SELECT ca.id, ca.name, ca.status, ca.currency,
             (SELECT count(*) FROM partnerships p WHERE p.campaign_id = ca.id)::bigint AS partnerships,
             (SELECT count(*) FROM tracking_clicks tc WHERE tc.campaign_id = ca.id AND tc.suspected = false AND tc.occurred_at >= ${range.from} AND tc.occurred_at < ${range.to})::bigint AS clicks,
             (SELECT count(*) FROM conversions cv WHERE cv.campaign_id = ca.id AND cv.verified_state = 'verified' AND cv.status NOT IN ('rejected','cancelled','reversed') AND cv.occurred_at >= ${range.from} AND cv.occurred_at < ${range.to})::bigint AS conversions,
             (SELECT sum(coalesce(gross_minor,0) - coalesce(discount_minor,0)) FROM conversions cv WHERE cv.campaign_id = ca.id AND cv.verified_state = 'verified' AND cv.status NOT IN ('rejected','cancelled','reversed') AND cv.occurred_at >= ${range.from} AND cv.occurred_at < ${range.to})::text AS sales,
             (SELECT sum(cc.commission_minor - cc.reversed_minor - cc.clawback_minor) FROM commission_calculations cc JOIN conversions cv ON cv.id = cc.conversion_id WHERE cv.campaign_id = ca.id AND cv.occurred_at >= ${range.from} AND cv.occurred_at < ${range.to})::text AS commission
        FROM campaigns ca WHERE ca.business_id = ${businessId}::uuid ORDER BY ca.created_at DESC LIMIT 200`;
    return { items: rows.map((r) => ({ id: r.id, name: r.name, status: r.status, currency: r.currency, partnerships: num(r.partnerships), clicks: num(r.clicks), conversions: num(r.conversions), salesMinor: big(r.sales), commissionMinor: big(r.commission), conversionRate: num(r.clicks) > 0 ? (num(r.conversions) / num(r.clicks)).toFixed(4) : null })), provenance: this.provenance(range) };
  }

  async timeseries(p: Principal, businessId: string, range: Range) {
    this.access.businessAccess(p, businessId, 'analytics.read');
    // `day` is a DATE column: compare on whole UTC days (the end day is inclusive).
    const dayOf = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    const rows = await this.prisma.analyticsDailyStat.findMany({ where: { businessId, scopeKey: { startsWith: '*:*:' }, day: { gte: dayOf(range.from), lte: dayOf(range.to) } }, orderBy: { day: 'asc' } });
    return { items: rows, provenance: { ...this.provenance(range), aggregated: true, note: 'Daily aggregates are refreshed by a background job.' } };
  }

  async creatorAnalytics(p: Principal, range: Range) {
    const creatorId = this.access.creatorId(p, 'creator.earnings.read');
    const rows = await this.prisma.$queryRaw<Array<{ partnership_id: string; campaign: string; business: string; clicks: bigint; conversions: bigint; currency: string; commission: string | null }>>`
      SELECT p.id AS partnership_id, ca.name AS campaign, b.display_name AS business, ca.currency,
             (SELECT count(*) FROM tracking_clicks tc WHERE tc.partnership_id = p.id AND tc.suspected = false AND tc.occurred_at >= ${range.from} AND tc.occurred_at < ${range.to})::bigint AS clicks,
             (SELECT count(*) FROM conversions cv WHERE cv.partnership_id = p.id AND cv.verified_state = 'verified' AND cv.status NOT IN ('rejected','cancelled','reversed') AND cv.occurred_at >= ${range.from} AND cv.occurred_at < ${range.to})::bigint AS conversions,
             (SELECT sum(cc.commission_minor - cc.reversed_minor - cc.clawback_minor) FROM commission_calculations cc JOIN conversions cv ON cv.id = cc.conversion_id WHERE cc.partnership_id = p.id AND cv.occurred_at >= ${range.from} AND cv.occurred_at < ${range.to})::text AS commission
        FROM partnerships p JOIN campaigns ca ON ca.id = p.campaign_id JOIN businesses b ON b.id = p.business_id
       WHERE p.creator_id = ${creatorId}::uuid ORDER BY p.created_at DESC`;
    return { items: rows.map((r) => ({ partnershipId: r.partnership_id, campaign: r.campaign, business: r.business, clicks: num(r.clicks), conversions: num(r.conversions), currency: r.currency, commissionMinor: big(r.commission), conversionRate: num(r.clicks) > 0 ? (num(r.conversions) / num(r.clicks)).toFixed(4) : null })), provenance: this.provenance(range) };
  }

  async platform(range: Range) {
    const [money, payouts, businesses, creators] = await Promise.all([
      this.prisma.$queryRaw<Array<{ currency: string; commission: string; fees: string; n: bigint }>>`
        SELECT cc.currency, sum(cc.commission_minor - cc.reversed_minor - cc.clawback_minor)::text AS commission, sum(cc.fee_minor - cc.fee_reversed_minor)::text AS fees, count(*)::bigint AS n
          FROM commission_calculations cc WHERE cc.calculated_at >= ${range.from} AND cc.calculated_at < ${range.to} GROUP BY cc.currency`,
      this.prisma.payout.groupBy({ by: ['currency', 'status'], where: { requestedAt: { gte: range.from, lt: range.to } }, _sum: { amountMinor: true }, _count: true }),
      this.prisma.business.count(),
      this.prisma.creator.count(),
    ]);
    return {
      commissions: money.map((m) => ({ currency: m.currency, commissionMinor: big(m.commission), codekFeesMinor: big(m.fees), count: num(m.n) })),
      payouts: payouts.map((p) => ({ currency: p.currency, status: p.status, amountMinor: p._sum.amountMinor ?? 0n, count: p._count })),
      businesses,
      creators,
      provenance: this.provenance(range),
    };
  }

  /** CSV export (spec §15.4 "CSV/Excel-ready"), no customer PII. Formula-injection safe. */
  async exportCsv(p: Principal, businessId: string, kind: 'conversions' | 'creators', range: Range): Promise<string> {
    this.access.businessAccess(p, businessId, 'analytics.read');
    if (kind === 'creators') {
      const t = await this.creatorTable(p, businessId, range);
      return toCsv(['creator_handle', 'campaign', 'status', 'code', 'clicks', 'conversions', 'currency', 'sales_minor', 'commission_minor', 'conversion_rate'], t.items.map((r) => [r.creator.handle, r.campaign.name, r.status, r.code, r.clicks, r.conversions, r.currency, r.salesMinor, r.commissionMinor, r.conversionRate]));
    }
    const rows = await this.prisma.conversion.findMany({
      where: { businessId, occurredAt: { gte: range.from, lt: range.to } },
      select: { id: true, externalRef: true, occurredAt: true, type: true, status: true, verifiedState: true, sourceSystem: true, currency: true, grossMinor: true, discountMinor: true, refundedMinor: true, partnershipId: true, commission: { select: { commissionMinor: true, reversedMinor: true, clawbackMinor: true, status: true } } },
      orderBy: { occurredAt: 'asc' },
      take: 100_000,
    });
    return toCsv(
      ['conversion_id', 'order_ref', 'occurred_at_utc', 'type', 'status', 'verified_state', 'source', 'currency', 'gross_minor', 'discount_minor', 'refunded_minor', 'partnership_id', 'commission_minor_net', 'commission_status'],
      rows.map((r) => [r.id, r.externalRef, r.occurredAt.toISOString(), r.type, r.status, r.verifiedState, r.sourceSystem, r.currency, r.grossMinor, r.discountMinor, r.refundedMinor, r.partnershipId, r.commission ? r.commission.commissionMinor - r.commission.reversedMinor - r.commission.clawbackMinor : null, r.commission?.status ?? null]),
    );
  }

  /** Background aggregation (analytics-aggregation job): daily business-level and per-partnership rows. */
  async aggregateDay(day: Date): Promise<number> {
    const start = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate()));
    const end = new Date(start.getTime() + 86400000);
    const rows = await this.prisma.$queryRaw<Array<{ business_id: string; partnership_id: string | null; campaign_id: string | null; currency: string | null; conversions: bigint; approved: bigint; sales: string | null; commission: string | null; fees: string | null }>>`
      SELECT c.business_id, c.partnership_id, c.campaign_id, c.currency,
             count(*)::bigint AS conversions,
             count(*) FILTER (WHERE c.status IN ('approved','partially_refunded'))::bigint AS approved,
             sum(coalesce(c.gross_minor,0) - coalesce(c.discount_minor,0)) FILTER (WHERE c.verified_state = 'verified' AND c.status NOT IN ('rejected','cancelled','reversed'))::text AS sales,
             sum(cc.commission_minor - cc.reversed_minor - cc.clawback_minor)::text AS commission,
             sum(cc.fee_minor - cc.fee_reversed_minor)::text AS fees
        FROM conversions c LEFT JOIN commission_calculations cc ON cc.conversion_id = c.id
       WHERE c.occurred_at >= ${start} AND c.occurred_at < ${end}
       GROUP BY GROUPING SETS ((c.business_id, c.currency), (c.business_id, c.partnership_id, c.campaign_id, c.currency))`;
    const clickRows = await this.prisma.$queryRaw<Array<{ business_id: string; partnership_id: string | null; clicks: bigint; qr: bigint }>>`
      SELECT business_id, partnership_id, count(*) FILTER (WHERE method = 'link')::bigint AS clicks, count(*) FILTER (WHERE method = 'qr')::bigint AS qr
        FROM tracking_clicks WHERE occurred_at >= ${start} AND occurred_at < ${end} AND suspected = false
       GROUP BY GROUPING SETS ((business_id), (business_id, partnership_id))`;
    let written = 0;
    for (const r of rows) {
      const scopeKey = `${r.campaign_id ?? '*'}:${r.partnership_id ?? '*'}:${r.currency ?? '*'}`;
      const clk = clickRows.find((c) => c.business_id === r.business_id && c.partnership_id === r.partnership_id);
      const data = { campaignId: r.campaign_id, partnershipId: r.partnership_id, currency: r.currency, clicks: num(clk?.clicks), qrScans: num(clk?.qr), conversions: num(r.conversions), approvedConversions: num(r.approved), verifiedSalesMinor: big(r.sales), commissionMinor: big(r.commission), feeMinor: big(r.fees), computedAt: new Date() };
      await this.prisma.analyticsDailyStat.upsert({ where: { day_businessId_scopeKey: { day: start, businessId: r.business_id, scopeKey } }, update: data, create: { day: start, businessId: r.business_id, scopeKey, ...data } });
      written++;
    }
    return written;
  }
}

export function toCsv(header: string[], rows: unknown[][]): string {
  const cell = (v: unknown): string => {
    if (v == null) return '';
    let s = typeof v === 'bigint' ? v.toString() : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // spreadsheet formula injection guard
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [header.join(','), ...rows.map((r) => r.map(cell).join(','))].join('\r\n') + '\r\n';
}
