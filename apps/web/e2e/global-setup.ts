import Redis from 'ioredis';

export const E2E_PREFIX = 'codek-e2e';

/**
 * Clears only the E2E namespace's rate-limit counters so the suite can be re-run locally without tripping the
 * per-IP sign-up limit (every browser context shares 127.0.0.1). Production limits are unchanged.
 */
export default async function globalSetup(): Promise<void> {
  const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', { lazyConnect: true, maxRetriesPerRequest: 1 });
  try {
    await redis.connect();
    const keys = await redis.keys(`${E2E_PREFIX}:rl:*`);
    if (keys.length) await redis.del(...keys);
  } finally {
    redis.disconnect();
  }
}
