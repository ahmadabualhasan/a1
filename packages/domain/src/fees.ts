import { invariant } from './errors';
import { assertRate, multiplyRate, type RoundingMode } from './money';

/**
 * CODEK platform fee plan (spec §3.7, §16 billing). The take rate is a commercial setting (D-003): the seeded default
 * plan charges 10% of the creator commission (provisional); operators manage plans in Admin → Settings.
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
