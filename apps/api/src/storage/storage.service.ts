import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { Global, Inject, Injectable, Module } from '@nestjs/common';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { Env } from '@codek/config';
import { ENV } from '../config/config.module';

/**
 * S3-compatible object storage abstraction (spec §17.2). Drivers: `local` (development/test) and `s3`
 * (any S3-compatible provider; CREDENTIAL_REQUIRED). Objects are always private; access goes through the API,
 * which checks object-level authorization before streaming.
 */
@Injectable()
export class StorageService {
  private s3?: S3Client;

  constructor(@Inject(ENV) private readonly env: Env) {
    if (env.STORAGE_DRIVER === 's3') {
      this.s3 = new S3Client({
        region: env.S3_REGION,
        endpoint: env.S3_ENDPOINT || undefined,
        forcePathStyle: env.S3_FORCE_PATH_STYLE,
        credentials: { accessKeyId: env.S3_ACCESS_KEY_ID!, secretAccessKey: env.S3_SECRET_ACCESS_KEY! },
      });
    }
  }

  get driver(): 'local' | 's3' {
    return this.env.STORAGE_DRIVER;
  }

  private localPath(key: string): string {
    const base = path.resolve(this.env.STORAGE_LOCAL_DIR);
    const full = path.resolve(base, key);
    if (!full.startsWith(base + path.sep)) throw new Error('Invalid storage key');
    return full;
  }

  async put(key: string, body: Buffer, contentType: string): Promise<{ checksum: string; size: number }> {
    assertKey(key);
    const checksum = createHash('sha256').update(body).digest('hex');
    if (this.s3) {
      await this.s3.send(new PutObjectCommand({ Bucket: this.env.S3_BUCKET, Key: key, Body: body, ContentType: contentType, ChecksumSHA256: Buffer.from(checksum, 'hex').toString('base64') }));
    } else {
      const p = this.localPath(key);
      await mkdir(path.dirname(p), { recursive: true });
      await writeFile(p, body, { flag: 'wx' });
    }
    return { checksum, size: body.length };
  }

  async get(key: string): Promise<Buffer> {
    assertKey(key);
    if (this.s3) {
      const r = await this.s3.send(new GetObjectCommand({ Bucket: this.env.S3_BUCKET, Key: key }));
      return Buffer.from(await r.Body!.transformToByteArray());
    }
    return readFile(this.localPath(key));
  }

  async healthy(): Promise<boolean> {
    if (this.s3) return true;
    try {
      await mkdir(path.resolve(this.env.STORAGE_LOCAL_DIR), { recursive: true });
      await stat(path.resolve(this.env.STORAGE_LOCAL_DIR));
      return true;
    } catch {
      return false;
    }
  }
}

function assertKey(key: string): void {
  if (!/^[a-z0-9][a-z0-9/_.-]{3,300}$/i.test(key) || key.includes('..')) throw new Error('Invalid storage key');
}

@Global()
@Module({ providers: [StorageService], exports: [StorageService] })
export class StorageModule {}
