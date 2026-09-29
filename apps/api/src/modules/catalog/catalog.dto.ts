import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { currencyCode, minorAmount } from '../../common/validation';
import { paginationSchema } from '../../common/pagination';

const item = {
  name: z.string().trim().min(2).max(160),
  type: z.enum(['product', 'service', 'subscription', 'other']),
  description: z.string().trim().max(4000).optional(),
  category: z.string().trim().max(60).optional(),
  priceMinor: minorAmount.optional(),
  currency: currencyCode.optional(),
  externalRef: z.string().trim().max(200).optional(),
  mediaIds: z.array(z.uuid()).max(10).optional(),
};

const refinePrice = <T extends { priceMinor?: number; currency?: string }>(v: T) => v.priceMinor == null || !!v.currency;

export class CreateCatalogItemDto extends createZodDto(z.object(item).refine(refinePrice, { message: 'currency is required with a price', path: ['currency'] })) {}
export class UpdateCatalogItemDto extends createZodDto(
  z
    .object({ ...item, active: z.boolean(), version: z.number().int().positive() })
    .partial()
    .required({ version: true })
    .strict(),
) {}
export class CatalogQueryDto extends createZodDto(paginationSchema.extend({ active: z.enum(['true', 'false']).optional(), q: z.string().max(80).optional() })) {}
