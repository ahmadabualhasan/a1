import { z } from 'zod';

/** Offset pagination is used consistently across list endpoints (documented in docs/API.md). */
export const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).max(100_000).default(0),
});
export type Pagination = z.infer<typeof paginationSchema>;

export function page<T>(items: T[], total: number, p: Pagination) {
  return { items, total, limit: p.limit, offset: p.offset };
}
