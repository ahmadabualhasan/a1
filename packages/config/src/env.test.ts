import { describe, expect, it } from 'vitest';
import { loadEnv, parseList } from './env';

const base = {
  DATABASE_URL: 'postgresql://x',
  AUTH_SECRET: 'a'.repeat(32),
  HASH_PEPPER: 'p'.repeat(16),
  SECRETS_MASTER_KEY: Buffer.alloc(32, 1).toString('base64'),
};

describe('env', () => {
  it('parses minimal development config with safe defaults', () => {
    const env = loadEnv({ ...base }, { cache: false });
    expect(env.APP_ENV).toBe('development');
    expect(env.PAYOUT_PROVIDER).toBe('sandbox');
    expect(env.AUTH_REQUIRE_EMAIL_VERIFICATION).toBe(true);
  });

  it('rejects missing secrets without echoing values', () => {
    expect(() => loadEnv({ DATABASE_URL: 'x' }, { cache: false })).toThrow(/AUTH_SECRET/);
  });

  it('forbids sandbox payouts and log email in production', () => {
    expect(() => loadEnv({ ...base, APP_ENV: 'production' }, { cache: false })).toThrow(/sandbox payout provider/);
  });

  it('requires S3 credentials for s3 storage', () => {
    expect(() => loadEnv({ ...base, STORAGE_DRIVER: 's3' }, { cache: false })).toThrow(/S3_BUCKET/);
  });

  it('parses comma lists', () => {
    expect(parseList(' a, b ,,c')).toEqual(['a', 'b', 'c']);
  });
});
