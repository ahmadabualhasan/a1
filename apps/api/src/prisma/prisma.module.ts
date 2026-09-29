import { Global, Module } from '@nestjs/common';
import { PrismaLifecycle, prismaProvider, PRISMA } from './prisma.service';

@Global()
@Module({ providers: [prismaProvider, PrismaLifecycle], exports: [PRISMA] })
export class PrismaModule {}
