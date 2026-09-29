import { Global, Inject, Injectable, Module } from '@nestjs/common';
import type { PrismaClient } from '@codek/database';
import { PRISMA } from '../prisma/prisma.service';

/** Reads system settings / feature flags (spec entity 60). Short in-process cache; admin changes apply within seconds. */
@Injectable()
export class SettingsService {
  private cache = new Map<string, { at: number; value: unknown; enabled: boolean }>();
  private readonly ttlMs = 5_000;

  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  private async row(key: string): Promise<{ value: unknown; enabled: boolean } | null> {
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < this.ttlMs) return hit;
    const r = await this.prisma.systemSetting.findUnique({ where: { key } });
    if (!r) return null;
    const v = { at: Date.now(), value: r.valueJson, enabled: r.enabled };
    this.cache.set(key, v);
    return v;
  }

  async get<T>(key: string, fallback: T): Promise<T> {
    const r = await this.row(key);
    return r && r.enabled ? (r.value as T) : fallback;
  }

  /** Feature flag: enabled row with a truthy value. Missing flags are OFF (fail closed). */
  async flag(key: string): Promise<boolean> {
    const r = await this.row(key);
    return !!r && r.enabled && r.value !== false;
  }

  invalidate(key?: string): void {
    if (key) this.cache.delete(key);
    else this.cache.clear();
  }
}

@Global()
@Module({ providers: [SettingsService], exports: [SettingsService] })
export class SettingsModule {}
