import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { fromNodeHeaders } from 'better-auth/node';
import type { Permission } from '@codek/domain';
import type { Env } from '@codek/config';
import { ENV } from '../config/config.module';
import { ApiError } from '../common/errors';
import { currentContext } from '../common/request-context';
import { ALLOW_UNVERIFIED, IS_PUBLIC, PLATFORM_PERMISSIONS } from './decorators';
import { AUTH, type AuthInstance } from './auth.tokens';
import { PrincipalLoader } from './principal.loader';
import type { AuthedRequest } from './principal';

/**
 * Global authentication guard (step 1-2 of the authorization pipeline, spec §20.9).
 * Resolves the DB-backed session, blocks suspended users and unverified emails, enforces admin MFA in
 * staging/production and function-level platform permissions. Object/tenant checks happen in services (AccessService).
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(AUTH) private readonly auth: AuthInstance,
    private readonly loader: PrincipalLoader,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (ctx.getType() !== 'http') return true;
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const targets = [ctx.getHandler(), ctx.getClass()];
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets);

    const hasCookie = (req.headers.cookie ?? '').includes('session_token');
    if (hasCookie) {
      const session = await this.auth.api.getSession({ headers: fromNodeHeaders(req.headers) }).catch(() => null);
      if (session?.user) {
        const principal = await this.loader.load(session.user.id, session.session.id);
        if (principal) {
          req.principal = principal;
          const store = currentContext();
          if (store) store.userId = principal.userId;
        }
      }
    }
    if (isPublic) return true;

    const p = req.principal;
    if (!p) throw new ApiError('UNAUTHENTICATED', 'Please sign in to continue');
    if (p.status !== 'active') throw new ApiError('FORBIDDEN', 'This account is not active');
    const allowUnverified = this.reflector.getAllAndOverride<boolean>(ALLOW_UNVERIFIED, targets);
    if (!allowUnverified && this.env.AUTH_REQUIRE_EMAIL_VERIFICATION && !p.emailVerified) {
      throw new ApiError('EMAIL_NOT_VERIFIED', 'Please verify your email address first');
    }
    const required = this.reflector.getAllAndOverride<Permission[] | undefined>(PLATFORM_PERMISSIONS, targets);
    if (required?.length) {
      if (!required.every((perm) => p.platformPermissions.has(perm))) throw new ApiError('FORBIDDEN', 'You do not have permission to perform this action');
      const mfaRequired = this.env.APP_ENV === 'staging' || this.env.APP_ENV === 'production';
      if (mfaRequired && !p.twoFactorEnabled) throw new ApiError('MFA_REQUIRED', 'Admin access requires two-factor authentication');
    }
    return true;
  }
}
