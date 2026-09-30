import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@codek/database';
import { loadEnv } from '@codek/config';
import { LocalEncryptedSecretStore } from '../src/secrets/secret-store';
import { startApp, type TestContext } from './harness';

let ctx: TestContext;
beforeAll(async () => {
  ctx = await startApp();
});
afterAll(async () => ctx.app.close());

const storeWith = (prisma: PrismaClient, key: string, previous?: string) =>
  new LocalEncryptedSecretStore(prisma, loadEnv({ ...process.env, SECRETS_MASTER_KEY: key, SECRETS_MASTER_KEY_PREVIOUS: previous ?? '' }, { cache: false }));

describe('master key rotation', () => {
  it('reads old secrets during rotation, re-encrypts them, and keeps them readable with only the new key', async () => {
    const oldKey = randomBytes(32).toString('base64');
    const newKey = randomBytes(32).toString('base64');
    const k = `rotation-test/${Date.now()}`;
    await storeWith(ctx.prisma, oldKey).put(k, 'whsec_old_secret_value');

    expect(() => storeWith(ctx.prisma, newKey).decrypt({ ciphertext: 'AA==', iv: 'AAAAAAAAAAAAAAAA', authTag: 'AAAAAAAAAAAAAAAAAAAAAA==' })).toThrow();
    await expect(storeWith(ctx.prisma, newKey).get(k)).rejects.toThrow();

    const rotating = storeWith(ctx.prisma, newKey, oldKey);
    expect(await rotating.get(k)).toBe('whsec_old_secret_value');
    const before = await ctx.prisma.encryptedSecret.findUniqueOrThrow({ where: { key: k } });
    const r = await rotating.reencryptAll();
    expect(r.failed).not.toContain(k);
    const after = await ctx.prisma.encryptedSecret.findUniqueOrThrow({ where: { key: k } });
    expect(after.ciphertext).not.toBe(before.ciphertext);
    expect(after.keyVersion).toBe(before.keyVersion + 1);

    expect(await storeWith(ctx.prisma, newKey).get(k)).toBe('whsec_old_secret_value');
    await expect(storeWith(ctx.prisma, oldKey).get(k)).rejects.toThrow();
    await ctx.prisma.encryptedSecret.delete({ where: { key: k } });
  });
});
