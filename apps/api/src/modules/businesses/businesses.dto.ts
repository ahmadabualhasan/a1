import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { countryCode, hostname, httpsUrl, ianaTimezone } from '../../common/validation';

const base = {
  legalName: z.string().trim().min(2).max(200),
  displayName: z.string().trim().min(2).max(120),
  category: z.string().trim().min(2).max(60),
  description: z.string().trim().max(4000).optional(),
  country: countryCode,
  city: z.string().trim().max(120).optional(),
  timezone: ianaTimezone,
  websiteUrl: httpsUrl.optional(),
  allowedDestinationHosts: z.array(hostname).max(10).optional(),
};

export const createBusinessSchema = z.object(base);
export class CreateBusinessDto extends createZodDto(createBusinessSchema) {}

/** Property-level authorization: verification status, billing readiness and ownership are not client-writable. */
export const updateBusinessSchema = z
  .object({ ...base, version: z.number().int().positive() })
  .partial()
  .required({ version: true })
  .strict();
export class UpdateBusinessDto extends createZodDto(updateBusinessSchema) {}

export class InviteMemberDto extends createZodDto(
  z.object({ email: z.email().transform((e) => e.toLowerCase()), role: z.enum(['business_manager', 'business_viewer']) }),
) {}

export class VerificationRequestDto extends createZodDto(
  z.object({
    registrationNumber: z.string().trim().max(100).optional(),
    notes: z.string().trim().max(2000).optional(),
    documentFileIds: z.array(z.uuid()).max(10).default([]),
  }),
) {}
