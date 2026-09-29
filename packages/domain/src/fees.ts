import { invariant } from './errors';
import { assertRate, multiplyRate, type RoundingMode } from './money';

/**
 * CODEK platform fee plan (spec §3.7, §16 billing). The actual take rate is a commercial decision
 * (DECISION NEEDED D-003). The default seeded plan charges 0 until the owner configures pricing.
 */
export type FeeBasis = 'none' | 'percentage_of_commission' | 'percentage_of_sale';

export interface FeePlan {
  planKey: string;
  basis: FeeBasis;
  rate?: string | null;
  roundingMode: RoundingMode;
}

export function validateFeePlan(plan: FeePlan): void {
  if (plan.basis !== 'none') {
    invariant(plan.rate != null, 'VALIDATION_FAILED', 'Fee plan rate required');
    assertRate(plan.rate);
  }
}

/** Fee charged to the business in addition to the creator commission. */
export function computePlatformFee(plan: FeePlan, input: { commissionMinor: bigint; saleBaseMinor: bigint }): bigint {
  validateFeePlan(plan);
  switch (plan.basis) {
    case 'none':
      return 0n;
    case 'percentage_of_commission':
      return multiplyRate(input.commissionMinor, plan.rate as string, plan.roundingMode);
    case 'percentage_of_sale':
      return multiplyRate(input.saleBaseMinor, plan.rate as string, plan.roundingMode);
  }
}
