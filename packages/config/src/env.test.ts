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

  it('requires a metrics token outside development when metrics are enabled', () => {
    expect(() => loadEnv({ ...base, APP_ENV: 'staging' }, { cache: false })).toThrow(/METRICS_TOKEN/);
    expect(() => loadEnv({ ...base, APP_ENV: 'staging', METRICS_ENABLED: 'false' }, { cache: false })).not.toThrow();
    expect(loadEnv({ ...base, METRICS_TOKEN: '' }, { cache: false }).METRICS_TOKEN).toBeUndefined();
    expect(loadEnv({ ...base, APP_ENV: 'staging', METRICS_TOKEN: 't'.repeat(32) }, { cache: false }).METRICS_TOKEN).toHaveLength(32);
  });

  it('TRUST_PROXY accepts booleans (1 hop) and explicit hop counts', () => {
    expect(loadEnv({ ...base }, { cache: false }).TRUST_PROXY).toBe(0);
    expect(loadEnv({ ...base, TRUST_PROXY: 'true' }, { cache: false }).TRUST_PROXY).toBe(1);
    expect(loadEnv({ ...base, TRUST_PROXY: '2' }, { cache: false }).TRUST_PROXY).toBe(2);
    expect(() => loadEnv({ ...base, TRUST_PROXY: 'yes' }, { cache: false })).toThrow(/TRUST_PROXY/);
  });

  it('rejects configuration for integrations that are not part of this build', () => {
    expect(() => loadEnv({ ...base, SENTRY_DSN: 'https://key@sentry.example/1' }, { cache: false })).toThrow(/SENTRY_DSN/);
    expect(loadEnv({ ...base, SENTRY_DSN: '' }, { cache: false }).SENTRY_DSN).toBeUndefined();
  });

  it('requires S3 credentials for s3 storage', () => {
    expect(() => loadEnv({ ...base, STORAGE_DRIVER: 's3' }, { cache: false })).toThrow(/S3_BUCKET/);
  });

  it('parses comma lists', () => {
    expect(parseList(' a, b ,,c')).toEqual(['a', 'b', 'c']);
  });
});
