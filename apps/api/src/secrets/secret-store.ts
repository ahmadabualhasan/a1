import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { Global, Inject, Injectable, Module } from '@nestjs/common';
import type { PrismaClient } from '@codek/database';
import type { Env } from '@codek/config';
import { ENV } from '../config/config.module';
import { PRISMA } from '../prisma/prisma.service';

/**
 * Secret manager abstraction (spec §11.3): integration credentials never live in plaintext DB fields, logs or
 * responses. Backend `local-encrypted` stores AES-256-GCM ciphertext (key from SECRETS_MASTER_KEY, which lives in the
 * platform secret manager). `aws-secrets-manager` is NOT_CONFIGURED in this build (see docs/KNOWN_LIMITATIONS.md).
 */
export interface SecretStore {
  put(key: string, value: string): Promise<void>;
  get(key: string): Promise<string | null>;
  delete(key: string): Promise<void>;
}

export const SECRET_STORE = Symbol('SECRET_STORE');

@Injectable()
export class LocalEncryptedSecretStore implements SecretStore {
  private readonly key: Buffer;
  private readonly previousKey: Buffer | null;

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(ENV) env: Env,
  ) {
    this.key = Buffer.from(env.SECRETS_MASTER_KEY, 'base64');
    if (this.key.length !== 32) throw new Error('SECRETS_MASTER_KEY must decode to 32 bytes');
    this.previousKey = env.SECRETS_MASTER_KEY_PREVIOUS ? Buffer.from(env.SECRETS_MASTER_KEY_PREVIOUS, 'base64') : null;
    if (this.previousKey && this.previousKey.length !== 32) throw new Error('SECRETS_MASTER_KEY_PREVIOUS must decode to 32 bytes');
  }

  encrypt(plaintext: string): { ciphertext: string; iv: string; authTag: string } {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return { ciphertext: ct.toString('base64'), iv: iv.toString('base64'), authTag: cipher.getAuthTag().toString('base64') };
  }

  private decryptWith(key: Buffer, row: { ciphertext: string; iv: string; authTag: string }): string {
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(row.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(row.authTag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(row.ciphertext, 'base64')), decipher.final()]).toString('utf8');
  }

  /** Current key first; during a rotation, falls back to the previous key (GCM authentication rejects a wrong key). */
  decrypt(row: { ciphertext: string; iv: string; authTag: string }): string {
    try {
      return this.decryptWith(this.key, row);
    } catch (err) {
      if (!this.previousKey) throw err;
      return this.decryptWith(this.previousKey, row);
    }
  }

  /**
   * Re-encrypt every stored secret with the current key (key rotation). Idempotent: rows already readable with the
   * current key are re-encrypted too, which is harmless. Fails without changing a row it cannot decrypt.
   */
  async reencryptAll(): Promise<{ reencrypted: number; failed: string[] }> {
    const rows = await this.prisma.encryptedSecret.findMany({ orderBy: { key: 'asc' } });
    const failed: string[] = [];
    let reencrypted = 0;
    for (const row of rows) {
      let plain: string;
      try {
        plain = this.decrypt(row);
      } catch {
        failed.push(row.key);
        continue;
      }
      const enc = this.encrypt(plain);
      await this.prisma.encryptedSecret.update({ where: { key: row.key }, data: { ...enc, keyVersion: { increment: 1 } } });
      reencrypted++;
    }
    return { reencrypted, failed };
  }

  async put(key: string, value: string): Promise<void> {
    const enc = this.encrypt(value);
    await this.prisma.encryptedSecret.upsert({ where: { key }, update: { ...enc }, create: { key, ...enc } });
  }

  async get(key: string): Promise<string | null> {
    const row = await this.prisma.encryptedSecret.findUnique({ where: { key } });
    return row ? this.decrypt(row) : null;
  }

  async delete(key: string): Promise<void> {
    await this.prisma.encryptedSecret.deleteMany({ where: { key } });
  }
}

@Global()
@Module({
  providers: [
    LocalEncryptedSecretStore,
    {
      provide: SECRET_STORE,
      inject: [ENV, LocalEncryptedSecretStore],
      useFactory: (env: Env, local: LocalEncryptedSecretStore): SecretStore => {
        if (env.SECRETS_BACKEND !== 'local-encrypted') throw new Error(`SECRETS_BACKEND=${env.SECRETS_BACKEND} is not implemented in this build`);
        return local;
      },
    },
  ],
  exports: [SECRET_STORE],
})
export class SecretsModule {}
