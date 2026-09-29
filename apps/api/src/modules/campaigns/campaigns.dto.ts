import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { countryCode, currencyCode, httpsUrl, ianaTimezone, isoDate, minorAmount, positiveMinor } from '../../common/validation';
import { paginationSchema } from '../../common/pagination';

const rate = z.string().regex(/^(0(\.\d{1,6})?|1(\.0{1,6})?)$/, 'Rate is a fraction between 0 and 1 with up to 6 decimals, e.g. "0.15"');

export const discountConfigSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('none') }),
  z.object({ type: z.literal('percentage'), rate, description: z.string().max(300).optional() }),
  z.object({ type: z.literal('fixed'), amountMinor: positiveMinor, description: z.string().max(300).optional() }),
  z.object({ type: z.literal('other'), description: z.string().min(3).max(300) }),
]);

export const commissionConfigSchema = z
  .object({
    type: z.enum(['percentage', 'fixed']),
    rate: rate.optional(),
    fixedMinor: positiveMinor.optional(),
    baseType: z.enum(['gross', 'discounted', 'net']),
    includeTax: z.boolean().default(false),
    includeShipping: z.boolean().default(false),
    excludedItems: z
      .object({ skus: z.array(z.string().max(200)).max(200).optional(), categories: z.array(z.string().max(200)).max(50).optional(), productIds: z.array(z.string().max(200)).max(200).optional() })
      .optional(),
    minMinor: minorAmount.optional(),
    maxMinor: minorAmount.optional(),
    roundingMode: z.enum(['half_up', 'half_even', 'floor', 'ceil']).default('half_up'),
    refundBehavior: z.enum(['reverse', 'clawback', 'none']).default('reverse'),
  })
  .refine((c) => (c.type === 'percentage' ? !!c.rate : c.fixedMinor != null), { message: 'Percentage needs rate; fixed needs fixedMinor', path: ['type'] });

export const attributionPolicySchema = z.object({
  model: z.enum(['code_first', 'link_first', 'last_touch', 'first_touch']).default('code_first'),
  windowDays: z.number().int().min(1).max(90).default(30),
});

export const deliverableSpecSchema = z.object({
  type: z.string().trim().min(2).max(60),
  description: z.string().trim().max(1000).optional(),
  dueDays: z.number().int().min(0).max(365).optional(),
  required: z.boolean().default(true),
});

export const contentRightsSchema = z.object({
  ownership: z.enum(['creator', 'business', 'shared']).default('creator'),
  organicAllowed: z.boolean().default(true),
  paidAdsAllowed: z.boolean().default(false),
  whitelistingAllowed: z.boolean().default(false),
  durationDays: z.number().int().min(1).max(3650).optional(),
  territory: z.string().max(200).optional(),
  exclusivity: z.object({ exclusive: z.boolean(), scope: z.string().max(300).optional(), durationDays: z.number().int().min(1).max(3650).optional() }).optional(),
});

export const promotionRulesSchema = z.object({
  codeUsageLimit: z.number().int().positive().max(10_000_000).optional(),
  perCustomerLimit: z.number().int().positive().max(1000).optional(),
  stackable: z.boolean().default(false),
  codePrefix: z.string().regex(/^[A-Za-z0-9]{2,8}$/).optional(),
  notes: z.string().max(1000).optional(),
});

export const eligibilityRuleSchema = z.discriminatedUnion('ruleType', [
  z.object({ ruleType: z.literal('min_followers'), operator: z.literal('gte'), value: z.object({ platform: z.string().max(40).optional(), count: z.number().int().positive() }) }),
  z.object({ ruleType: z.literal('country'), operator: z.literal('in'), value: z.object({ countries: z.array(countryCode).min(1).max(50) }) }),
  z.object({ ruleType: z.literal('category'), operator: z.literal('any'), value: z.object({ categories: z.array(z.string().max(40)).min(1).max(20) }) }),
  z.object({ ruleType: z.literal('verified_only'), operator: z.literal('eq'), value: z.object({ verified: z.literal(true) }) }),
]);

const campaignBase = z.object({
  catalogItemId: z.uuid(),
  name: z.string().trim().min(3).max(160),
  description: z.string().trim().max(8000).optional(),
  category: z.string().trim().min(2).max(60),
  imageFileId: z.uuid().optional(),
  startAt: isoDate.optional(),
  endAt: isoDate.optional(),
  timezone: ianaTimezone,
  participantCap: z.number().int().positive().max(100_000).optional(),
  applicationDeadlineAt: isoDate.optional(),
  waitlistEnabled: z.boolean().default(false),
  compensationType: z.enum(['commission_only', 'gift_commission', 'fixed_fee_commission', 'paid_content']),
  productServiceProvided: z.boolean().default(false),
  fixedFeeMinor: positiveMinor.optional(),
  destinationUrl: httpsUrl.optional(),
  conversionSourceType: z.enum(['webhook_api', 'pos', 'booking_api', 'redemption_interface', 'manual_evidence', 'other']),
  integrationId: z.uuid().optional(),
  fulfillmentMode: z.enum(['online', 'offline', 'hybrid']).default('online'),
  locationCountry: countryCode.optional(),
  locationCity: z.string().trim().max(120).optional(),
  platforms: z.array(z.string().trim().max(40)).max(10).default([]),
  currency: currencyCode,
  discountConfig: discountConfigSchema,
  commission: commissionConfigSchema,
  attributionPolicy: attributionPolicySchema.default({ model: 'code_first', windowDays: 30 }),
  holdPeriodDays: z.number().int().min(0).max(365),
  conversionApprovalMode: z.enum(['auto_verified', 'manual']).default('auto_verified'),
  deliverables: z.array(deliverableSpecSchema).max(20).default([]),
  contentRights: contentRightsSchema.optional(),
  promotionRules: promotionRulesSchema.default({ stackable: false }),
  cancellationRefundPolicy: z.string().trim().max(2000).optional(),
  disclosureRequirements: z.object({ jurisdiction: countryCode.optional(), text: z.string().max(1000) }).optional(),
  eligibility: z.array(eligibilityRuleSchema).max(10).default([]),
});

export const createCampaignSchema = campaignBase;
export type CreateCampaignInput = z.infer<typeof createCampaignSchema>;
export class CreateCampaignDto extends createZodDto(createCampaignSchema) {}

export const updateCampaignSchema = campaignBase.omit({ catalogItemId: true, currency: true }).partial().extend({ version: z.number().int().positive() }).strict();
export type UpdateCampaignInput = z.infer<typeof updateCampaignSchema>;
export class UpdateCampaignDto extends createZodDto(updateCampaignSchema) {}

export class CampaignListQueryDto extends createZodDto(
  paginationSchema.extend({ status: z.enum(['draft', 'pending_review', 'published', 'active', 'paused', 'ended', 'archived']).optional() }),
) {}

export class MarketplaceQueryDto extends createZodDto(
  paginationSchema.extend({
    q: z.string().trim().max(80).optional(),
    category: z.string().trim().max(60).optional(),
    country: countryCode.optional(),
    city: z.string().trim().max(120).optional(),
    platform: z.string().trim().max(40).optional(),
    compensationType: z.enum(['commission_only', 'gift_commission', 'fixed_fee_commission', 'paid_content']).optional(),
    fulfillmentMode: z.enum(['online', 'offline', 'hybrid']).optional(),
    productServiceProvided: z.enum(['true', 'false']).optional(),
    hasDiscount: z.enum(['true', 'false']).optional(),
    minCommissionRate: rate.optional(),
    maxDurationDays: z.coerce.number().int().positive().max(3650).optional(),
    sort: z.enum(['newest', 'ending_soon']).default('newest'),
  }),
) {}

export class ReasonDto extends createZodDto(z.object({ reason: z.string().trim().min(3).max(1000) })) {}
