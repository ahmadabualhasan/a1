import { DomainError, type AttributionPolicy, type CommissionRuleSnapshot, type FeePlan, validateCommissionRule } from '@codek/domain';
import type { CommissionRule, Campaign } from '@codek/database';
import type { z } from 'zod';
import type { commissionConfigSchema } from './campaigns.dto';

export type CommissionConfig = z.infer<typeof commissionConfigSchema>;

/** Compensation models enabled in V1 (spec §3.6 allows a smaller launch subset). See D-023. */
export const SUPPORTED_COMPENSATION = new Set(['commission_only', 'gift_commission']);

export function toRuleSnapshot(rule: CommissionRule): CommissionRuleSnapshot {
  return {
    ruleId: rule.id,
    version: rule.version,
    type: rule.type,
    rate: rule.rate?.toString() ?? null,
    fixedMinor: rule.fixedMinor,
    baseType: rule.baseType,
    includeTax: rule.includeTax,
    includeShipping: rule.includeShipping,
    excludedItems: (rule.excludedItems as CommissionRuleSnapshot['excludedItems']) ?? null,
    minMinor: rule.minMinor,
    maxMinor: rule.maxMinor,
    currency: rule.currency,
    roundingMode: rule.roundingMode,
    refundBehavior: rule.refundBehavior,
  };
}

/** Validate a commission config with the domain engine before persisting (currency pinned to the campaign). */
export function validateCommissionConfig(c: CommissionConfig, currency: string): void {
  validateCommissionRule({
    ruleId: 'new',
    version: 1,
    type: c.type,
    rate: c.rate ?? null,
    fixedMinor: c.fixedMinor != null ? BigInt(c.fixedMinor) : null,
    baseType: c.baseType,
    includeTax: c.includeTax,
    includeShipping: c.includeShipping,
    excludedItems: c.excludedItems ?? null,
    minMinor: c.minMinor != null ? BigInt(c.minMinor) : null,
    maxMinor: c.maxMinor != null ? BigInt(c.maxMinor) : null,
    currency,
    roundingMode: c.roundingMode,
    refundBehavior: c.refundBehavior,
  });
}

export function ruleCreateData(businessId: string, ruleKey: string, version: number, c: CommissionConfig, currency: string) {
  return {
    businessId,
    ruleKey,
    version,
    type: c.type,
    rate: c.type === 'percentage' ? c.rate : null,
    fixedMinor: c.type === 'fixed' && c.fixedMinor != null ? BigInt(c.fixedMinor) : null,
    baseType: c.baseType,
    includeTax: c.includeTax,
    includeShipping: c.includeShipping,
    excludedItems: c.excludedItems ?? undefined,
    minMinor: c.minMinor != null ? BigInt(c.minMinor) : null,
    maxMinor: c.maxMinor != null ? BigInt(c.maxMinor) : null,
    currency,
    roundingMode: c.roundingMode,
    refundBehavior: c.refundBehavior,
  } as const;
}

export function attributionPolicyOf(campaign: Pick<Campaign, 'id' | 'attributionPolicy' | 'attributionPolicyVersion'>): AttributionPolicy {
  const cfg = campaign.attributionPolicy as { model: AttributionPolicy['model']; windowDays: number };
  return {
    policyId: `campaign:${campaign.id}`,
    version: campaign.attributionPolicyVersion,
    model: cfg.model,
    windowSeconds: cfg.windowDays * 86400,
    clockSkewSeconds: 300,
  };
}

export function assertSupportedCompensation(type: string, fixedFeeMinor?: number): void {
  if (!SUPPORTED_COMPENSATION.has(type)) {
    throw new DomainError('UNSUPPORTED_CONFIGURATION', 'Fixed-fee and paid-content campaigns are not available yet', { compensationType: type });
  }
  if (fixedFeeMinor != null) throw new DomainError('UNSUPPORTED_CONFIGURATION', 'Fixed fees are not available yet');
}

export type { FeePlan };
