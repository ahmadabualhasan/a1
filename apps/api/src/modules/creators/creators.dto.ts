import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { countryCode, httpsUrl, tagList } from '../../common/validation';
import { paginationSchema } from '../../common/pagination';

const profile = {
  handle: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9][a-z0-9_.]{2,29}$/, 'Handle: 3-30 characters, letters, digits, "_" or "."'),
  displayName: z.string().trim().min(2).max(80),
  bio: z.string().trim().max(2000).optional(),
  country: countryCode.optional(),
  city: z.string().trim().max(120).optional(),
  languages: tagList.optional(),
  categories: tagList.optional(),
  portfolioUrls: z.array(httpsUrl).max(10).optional(),
};

export class CreateCreatorProfileDto extends createZodDto(z.object(profile)) {}
export class UpdateCreatorProfileDto extends createZodDto(
  z.object({ ...profile, version: z.number().int().positive() }).partial().required({ version: true }).omit({ handle: true }).strict(),
) {}

export const SOCIAL_PLATFORMS = ['instagram', 'tiktok', 'youtube', 'snapchat', 'x', 'facebook', 'linkedin', 'twitch', 'other'] as const;

const metric = z.number().int().nonnegative().max(10_000_000_000);
export const socialAccountSchema = z.object({
  platform: z.enum(SOCIAL_PLATFORMS),
  handle: z.string().trim().min(1).max(100),
  profileUrl: httpsUrl.optional(),
  followerCount: metric.optional(),
  averageViews: metric.optional(),
  engagementRate: z
    .string()
    .regex(/^\d+(\.\d{1,6})?$/)
    .refine((v) => Number(v) <= 1, 'Engagement rate is a fraction between 0 and 1')
    .optional(),
  likesAvg: metric.optional(),
  commentsAvg: metric.optional(),
});
export class SocialAccountDto extends createZodDto(socialAccountSchema) {}
export class UpdateSocialAccountDto extends createZodDto(socialAccountSchema.omit({ platform: true }).partial()) {}

export class CreatorSearchDto extends createZodDto(
  paginationSchema.extend({
    q: z.string().trim().max(80).optional(),
    category: z.string().trim().max(40).optional(),
    country: countryCode.optional(),
    platform: z.enum(SOCIAL_PLATFORMS).optional(),
    minFollowers: z.coerce.number().int().nonnegative().optional(),
    verifiedOnly: z.coerce.boolean().optional(),
  }),
) {}
