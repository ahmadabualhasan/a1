import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Permission } from '@codek/domain';
import { ApiError } from '../common/errors';
import type { AuthedRequest, Principal } from './principal';

export const IS_PUBLIC = 'codek:public';
export const ALLOW_UNVERIFIED = 'codek:allow-unverified';
export const PLATFORM_PERMISSIONS = 'codek:platform-permissions';

/** Route does not require authentication (auth, marketplace browsing, tracking, webhooks, health). */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC, true);
/** Authenticated route usable before email verification (session info, resend verification). */
export const AllowUnverified = (): MethodDecorator & ClassDecorator => SetMetadata(ALLOW_UNVERIFIED, true);
/** Function-level authorization for platform/admin routes (checked by AuthGuard). */
export const RequirePlatformPermission = (...perms: Permission[]): MethodDecorator & ClassDecorator =>
  SetMetadata(PLATFORM_PERMISSIONS, perms);

export const CurrentPrincipal = createParamDecorator((_data: unknown, ctx: ExecutionContext): Principal => {
  const req = ctx.switchToHttp().getRequest<AuthedRequest>();
  if (!req.principal) throw new ApiError('UNAUTHENTICATED', 'Authentication required');
  return req.principal;
});

export const OptionalPrincipal = createParamDecorator((_data: unknown, ctx: ExecutionContext): Principal | undefined => {
  return ctx.switchToHttp().getRequest<AuthedRequest>().principal;
});
