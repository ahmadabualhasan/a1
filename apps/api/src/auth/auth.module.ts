import { Global, Module } from '@nestjs/common';
import type { PrismaClient } from '@codek/database';
import type { Env } from '@codek/config';
import { ENV } from '../config/config.module';
import { PRISMA } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { createBetterAuth } from './better-auth';
import { AUTH } from './auth.tokens';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PrincipalLoader } from './principal.loader';
import { AuthGuard } from './auth.guard';

@Global()
@Module({
  controllers: [AuthController],
  providers: [
    EmailService,
    {
      provide: AUTH,
      inject: [PRISMA, ENV, EmailService],
      useFactory: (prisma: PrismaClient, env: Env, email: EmailService) => createBetterAuth(prisma, env, email),
    },
    AuthService,
    PrincipalLoader,
    AuthGuard,
  ],
  exports: [AUTH, AuthService, PrincipalLoader, AuthGuard, EmailService],
})
export class AuthModule {}
