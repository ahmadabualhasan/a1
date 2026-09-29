import { z } from 'zod';
import { parseHttpUrl } from '@codek/domain';

export const countryCode = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{2}$/, 'Use a 2-letter ISO country code');

export const currencyCode = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, 'Use a 3-letter ISO currency code');

export const ianaTimezone = z.string().refine((tz) => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}, 'Unknown timezone');

export const httpsUrl = z
  .string()
  .trim()
  .max(2048)
  .refine((u) => {
    try {
      parseHttpUrl(u);
      return true;
    } catch {
      return false;
    }
  }, 'Must be a valid https URL');

export const hostname = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/, 'Invalid host name');

export const tagList = z.array(z.string().trim().min(1).max(40)).max(20);
export const minorAmount = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const positiveMinor = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
export const uuid = z.uuid();
export const version = z.number().int().positive();

export function slugify(input: string): string {
  const base = input
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return base || 'item';
}
