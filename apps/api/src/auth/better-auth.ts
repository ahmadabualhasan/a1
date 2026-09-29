import { randomUUID } from 'node:crypto';
import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { twoFactor } from 'better-auth/plugins';
import type { PrismaClient } from '@codek/database';
import { parseList, type Env } from '@codek/config';
import { pseudonymize } from '@codek/domain';
import type { EmailService } from '../email/email.service';
import { currentContext } from '../common/request-context';

export const COOKIE_PREFIX = 'codek';

/**
 * Better Auth is used as a library behind CODEK's own /api/v1/auth routes (ADR-0003):
 * DB-backed sessions via Prisma, email/password with verification + reset, TOTP MFA plugin.
 * Raw IP addresses are not stored; the session keeps a keyed hash instead (spec §14.2).
 */
export function createBetterAuth(prisma: PrismaClient, env: Env, email: EmailService) {
  const web = env.WEB_PUBLIC_URL.replace(/\/$/, '');
  return betterAuth({
    appName: 'CODEK',
    secret: env.AUTH_SECRET,
    baseURL: env.API_PUBLIC_URL,
    basePath: '/api/v1/auth/core',
    trustedOrigins: parseList(env.CORS_ALLOWED_ORIGINS),
    database: prismaAdapter(prisma, { provider: 'postgresql' }),
    telemetry: { enabled: false },
    user: {
      modelName: 'user',
      additionalFields: {
        accountType: { type: 'string', input: false, required: false, defaultValue: 'creator' },
        status: { type: 'string', input: false, required: false, defaultValue: 'active' },
      },
    },
    session: {
      modelName: 'session',
      expiresIn: env.SESSION_TTL_SECONDS,
      updateAge: 60 * 60 * 24,
      additionalFields: { ipHash: { type: 'string', input: false, required: false } },
    },
    account: { modelName: 'account' },
    verification: { modelName: 'verificationToken' },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: env.AUTH_REQUIRE_EMAIL_VERIFICATION,
      minPasswordLength: 10,
      maxPasswordLength: 128,
      autoSignIn: !env.AUTH_REQUIRE_EMAIL_VERIFICATION,
      resetPasswordTokenExpiresIn: 60 * 60,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, token }) => {
        await email.send({
          to: user.email,
          template: 'auth.reset_password',
          subject: 'Reset your CODEK password',
          text: `We received a request to reset your password.\n\nReset it here (valid for 1 hour): ${web}/reset-password?token=${encodeURIComponent(token)}\n\nIf you did not ask for this, you can ignore this email.`,
        });
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: false,
      expiresIn: 60 * 60 * 24,
      sendVerificationEmail: async ({ user, token }) => {
        await email.send({
          to: user.email,
          template: 'auth.verify_email',
          subject: 'Verify your CODEK email',
          text: `Welcome to CODEK!\n\nConfirm your email address: ${web}/verify-email?token=${encodeURIComponent(token)}\n\nThis link expires in 24 hours.`,
        });
      },
      afterEmailVerification: async (user) => {
        await prisma.user.update({ where: { id: user.id }, data: { emailVerifiedAt: new Date() } });
      },
    },
    plugins: [twoFactor({ issuer: 'CODEK' })],
    advanced: {
      cookiePrefix: COOKIE_PREFIX,
      useSecureCookies: env.APP_ENV === 'production' || env.APP_ENV === 'staging',
      defaultCookieAttributes: { httpOnly: true, sameSite: 'lax', path: '/' },
      ipAddress: { disableIpTracking: true },
      database: { generateId: () => randomUUID() },
    },
    databaseHooks: {
      session: {
        create: {
          before: async (session) => {
            const ctx = currentContext();
            return { data: { ...session, ipHash: ctx?.ipHash ?? null } };
          },
          after: async (session) => {
            await prisma.user.update({ where: { id: session.userId }, data: { lastLoginAt: new Date() } }).catch(() => undefined);
          },
        },
      },
    },
    rateLimit: { enabled: false },
  });
}

export type CodekAuth = ReturnType<typeof createBetterAuth>;

export function hashIp(ip: string, pepper: string): string {
  return pseudonymize(ip, pepper);
}
