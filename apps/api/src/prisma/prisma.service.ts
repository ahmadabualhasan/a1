import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { createPrismaClient, type PrismaClient } from '@codek/database';
import type { Env } from '@codek/config';
import { ENV } from '../config/config.module';

export const PRISMA = Symbol('PRISMA');

@Injectable()
export class PrismaLifecycle implements OnModuleDestroy {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}
  async onModuleDestroy(): Promise<void> {
    await this.prisma.$disconnect();
  }
}

export const prismaProvider = {
  provide: PRISMA,
  inject: [ENV],
  useFactory: (env: Env): PrismaClient => createPrismaClient({ connectionString: env.DATABASE_URL, max: 10 }),
};
