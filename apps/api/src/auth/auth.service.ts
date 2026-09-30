import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Response } from 'express';
import type { IncomingHttpHeaders } from 'node:http';
import { fromNodeHeaders } from 'better-auth/node';
import { LEGAL_DOCUMENT_TYPES, type PrismaClient } from '@codek/database';
import type { Env } from '@codek/config';
import { ENV } from '../config/config.module';
import { PRISMA } from '../prisma/prisma.service';
import { ApiError } from '../common/errors';
import { currentContext } from '../common/request-context';
import { AuditService } from '../audit/audit.service';
import { EmailService } from '../email/email.service';
import { MetricsService } from '../observability/metrics.service';
import { AUTH, type AuthInstance } from './auth.tokens';
import type { Principal } from './principal';
import type { SignUpDto } from './auth.dto';

type BaResponse = globalThis.Response;

@Injectable()
export class AuthService {
  private readonly logger = new Logger('AuthService');

  constructor(
    @Inject(AUTH) private readonly auth: AuthInstance,
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(ENV) private readonly env: Env,
    private readonly audit: AuditService,
    private readonly email: EmailService,
    private readonly metrics: MetricsService,
  ) {}

  /** Copy Set-Cookie headers from a Better Auth Response onto the Express response. */
  forwardCookies(from: BaResponse, res: Response): void {
    const cookies = from.headers.getSetCookie();
    if (cookies.length) res.append('Set-Cookie', cookies);
  }

  private async body<T>(r: BaResponse): Promise<T | null> {
    const text = await r.text();
    if (!text) return null;
    try {
      return JSON.parse(text) as T;
    } catch {
      return null;
    }
  }

  /** Legal documents that a role must accept at sign-up (latest published version of each required type). */
  async requiredLegalDocuments(role: 'business' | 'creator') {
    const docs = await this.prisma.legalDocument.findMany({
      where: { status: 'published', requiredFor: { has: role } },
      orderBy: { publishedAt: 'desc' },
    });
    const latest = new Map<string, (typeof docs)[number]>();
    for (const d of docs) if (!latest.has(d.documentType)) latest.set(d.documentType, d);
    return [...latest.values()];
  }

  async signUp(dto: SignUpDto, headers: IncomingHttpHeaders, res: Response): Promise<{ status: 'verification_required' | 'signed_in' }> {
    const required = await this.requiredLegalDocuments(dto.role);
    // Fail closed: accounts cannot be created before every required document type has a published version.
    const requiredTypes = LEGAL_DOCUMENT_TYPES.filter((t) => (t.requiredFor as readonly string[]).includes(dto.role)).map((t) => t.type as string);
    const unpublished = requiredTypes.filter((t) => !required.some((d) => d.documentType === t));
    if (unpublished.length) {
      throw new ApiError('FEATURE_DISABLED', 'Sign-up is not available yet. Please try again later.', { reason: 'LEGAL_DOCUMENTS_NOT_PUBLISHED' });
    }
    const accepted = new Set(dto.acceptedLegalDocumentIds);
    const missing = required.filter((d) => !accepted.has(d.id));
    if (missing.length) {
      throw new ApiError('VALIDATION_FAILED', 'Please accept the required terms to continue', {
        missing: missing.map((d) => ({ id: d.id, documentType: d.documentType, version: d.version })),
      });
    }
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email }, select: { id: true } });
    if (existing) {
      // Do not reveal whether an email is registered (account enumeration). Notify the owner instead.
      await this.email.send({
        to: dto.email,
        template: 'auth.sign_up_existing',
        subject: 'Someone tried to create a CODEK account with your email',
        text: 'An attempt was made to sign up with this email address, which already has a CODEK account. If this was you, sign in or reset your password.',
      });
      return { status: 'verification_required' };
    }
    const r = await this.auth.api.signUpEmail({
      body: { email: dto.email, password: dto.password, name: dto.displayName },
      headers: fromNodeHeaders(headers),
      asResponse: true,
    });
    if (!r.ok) {
      const b = await this.body<{ code?: string; message?: string }>(r);
      if (b?.code === 'PASSWORD_TOO_SHORT' || b?.code === 'PASSWORD_TOO_LONG' || b?.code === 'INVALID_EMAIL') {
        throw new ApiError('VALIDATION_FAILED', b.message ?? 'Invalid sign-up details');
      }
      if (b?.code?.includes('ALREADY_EXISTS')) return { status: 'verification_required' };
      this.logger.warn({ status: r.status, code: b?.code }, 'sign-up rejected by auth provider');
      throw new ApiError('BAD_REQUEST', 'Sign-up could not be completed');
    }
    const created = await this.body<{ user?: { id: string } }>(r);
    const userId = created?.user?.id;
    if (!userId) throw new ApiError('INTERNAL_ERROR', 'Sign-up could not be completed');
    const ctx = currentContext();
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { accountType: dto.role } });
      if (dto.role === 'creator') {
        const role = await tx.role.findUniqueOrThrow({ where: { name: 'creator' } });
        await tx.userRole.create({ data: { userId, roleId: role.id } });
      }
      await tx.legalAcceptance.createMany({
        data: required.map((d) => ({
          userId,
          legalDocumentId: d.id,
          context: 'sign_up',
          ipHash: ctx?.ipHash ?? null,
          userAgentHash: ctx?.userAgentHash ?? null,
        })),
      });
      await this.audit.record({ actorUserId: userId, action: 'auth.sign_up', objectType: 'user', objectId: userId, after: { role: dto.role } }, tx);
    });
    this.forwardCookies(r, res);
    return { status: this.env.AUTH_REQUIRE_EMAIL_VERIFICATION ? 'verification_required' : 'signed_in' };
  }

  async signIn(email: string, password: string, headers: IncomingHttpHeaders, res: Response): Promise<{ status: 'signed_in' | 'mfa_required' }> {
    const r = await this.auth.api.signInEmail({ body: { email, password }, headers: fromNodeHeaders(headers), asResponse: true });
    const b = await this.body<{ twoFactorRedirect?: boolean; code?: string; user?: { id: string } }>(r);
    if (!r.ok) {
      this.metrics.authFailures.inc();
      await this.audit.record({ actorType: 'system', action: 'auth.sign_in_failed', objectType: 'user', reason: b?.code ?? String(r.status) });
      if (r.status === 403 && b?.code === 'EMAIL_NOT_VERIFIED') {
        throw new ApiError('EMAIL_NOT_VERIFIED', 'Please verify your email address before signing in. We sent you a new link.');
      }
      throw new ApiError('UNAUTHENTICATED', 'Incorrect email or password');
    }
    const user = b?.user?.id ? await this.prisma.user.findUnique({ where: { id: b.user.id }, select: { status: true } }) : null;
    if (user && user.status !== 'active') {
      // Revoke the session just created for a suspended account.
      await this.auth.api.signOut({ headers: cookieHeadersFrom(r) }).catch(() => undefined);
      throw new ApiError('FORBIDDEN', 'This account is not active. Please contact support.');
    }
    this.forwardCookies(r, res);
    if (b?.twoFactorRedirect) return { status: 'mfa_required' };
    if (b?.user?.id) await this.audit.record({ actorUserId: b.user.id, action: 'auth.sign_in', objectType: 'user', objectId: b.user.id });
    return { status: 'signed_in' };
  }

  async signOut(headers: IncomingHttpHeaders, res: Response, principal?: Principal): Promise<void> {
    const r = await this.auth.api.signOut({ headers: fromNodeHeaders(headers), asResponse: true });
    this.forwardCookies(r, res);
    if (principal) await this.audit.record({ actorUserId: principal.userId, action: 'auth.sign_out', objectType: 'session', objectId: principal.sessionId });
  }

  async verifyEmail(token: string): Promise<void> {
    const r = await this.auth.api.verifyEmail({ query: { token }, asResponse: true });
    if (!r.ok && r.status !== 302) throw new ApiError('BAD_REQUEST', 'This verification link is invalid or has expired');
  }

  async resendVerification(email: string): Promise<void> {
    await this.auth.api.sendVerificationEmail({ body: { email } }).catch(() => undefined);
  }

  async forgotPassword(email: string): Promise<void> {
    await this.auth.api.requestPasswordReset({ body: { email, redirectTo: `${this.env.WEB_PUBLIC_URL}/reset-password` } }).catch((err: unknown) => {
      this.logger.warn({ err: (err as Error)?.message }, 'password reset request failed');
    });
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const r = await this.auth.api.resetPassword({ body: { token, newPassword }, asResponse: true });
    if (!r.ok) throw new ApiError('BAD_REQUEST', 'This reset link is invalid or has expired');
    await this.audit.record({ actorType: 'system', action: 'auth.password_reset', objectType: 'user' });
  }

  async changePassword(p: Principal, headers: IncomingHttpHeaders, res: Response, current: string, next: string, revokeOthers: boolean): Promise<void> {
    const r = await this.auth.api.changePassword({
      body: { currentPassword: current, newPassword: next, revokeOtherSessions: revokeOthers },
      headers: fromNodeHeaders(headers),
      asResponse: true,
    });
    if (!r.ok) throw new ApiError('VALIDATION_FAILED', 'Current password is incorrect or the new password is invalid');
    this.forwardCookies(r, res);
    await this.audit.record({ actorUserId: p.userId, action: 'auth.password_changed', objectType: 'user', objectId: p.userId });
  }

  async listSessions(p: Principal) {
    const sessions = await this.prisma.session.findMany({
      where: { userId: p.userId, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
      select: { id: true, createdAt: true, expiresAt: true, userAgent: true, updatedAt: true },
    });
    return sessions.map((s) => ({ ...s, current: s.id === p.sessionId }));
  }

  async revokeOtherSessions(p: Principal, headers: IncomingHttpHeaders): Promise<void> {
    await this.auth.api.revokeOtherSessions({ headers: fromNodeHeaders(headers) });
    await this.audit.record({ actorUserId: p.userId, action: 'auth.sessions_revoked', objectType: 'user', objectId: p.userId });
  }

  async mfaEnable(p: Principal, password: string, headers: IncomingHttpHeaders) {
    const r = await this.auth.api.enableTwoFactor({ body: { password }, headers: fromNodeHeaders(headers), asResponse: true });
    if (!r.ok) throw new ApiError('VALIDATION_FAILED', 'Password is incorrect');
    const b = await this.body<{ totpURI: string; backupCodes: string[] }>(r);
    await this.audit.record({ actorUserId: p.userId, action: 'auth.mfa_setup_started', objectType: 'user', objectId: p.userId });
    return { totpURI: b?.totpURI, backupCodes: b?.backupCodes };
  }

  async mfaVerify(code: string, headers: IncomingHttpHeaders, res: Response, trustDevice = false, principal?: Principal): Promise<void> {
    const r = await this.auth.api.verifyTOTP({ body: { code, trustDevice }, headers: fromNodeHeaders(headers), asResponse: true });
    if (!r.ok) throw new ApiError('VALIDATION_FAILED', 'The code is incorrect or expired');
    this.forwardCookies(r, res);
    await this.audit.record({ actorUserId: principal?.userId ?? null, action: 'auth.mfa_verified', objectType: 'user', objectId: principal?.userId ?? null });
  }

  async mfaVerifyBackupCode(code: string, headers: IncomingHttpHeaders, res: Response): Promise<void> {
    const r = await this.auth.api.verifyBackupCode({ body: { code }, headers: fromNodeHeaders(headers), asResponse: true });
    if (!r.ok) throw new ApiError('VALIDATION_FAILED', 'The backup code is incorrect');
    this.forwardCookies(r, res);
  }

  async mfaDisable(p: Principal, password: string, headers: IncomingHttpHeaders, res: Response): Promise<void> {
    const r = await this.auth.api.disableTwoFactor({ body: { password }, headers: fromNodeHeaders(headers), asResponse: true });
    if (!r.ok) throw new ApiError('VALIDATION_FAILED', 'Password is incorrect');
    this.forwardCookies(r, res);
    await this.audit.record({ actorUserId: p.userId, action: 'auth.mfa_disabled', objectType: 'user', objectId: p.userId });
  }

  sessionView(p: Principal) {
    return {
      user: { id: p.userId, email: p.email, displayName: p.displayName, emailVerified: p.emailVerified, accountType: p.accountType, twoFactorEnabled: p.twoFactorEnabled },
      creatorId: p.creatorId,
      businesses: [...p.businesses.values()].map((b) => ({ businessId: b.businessId, role: b.role, permissions: [...b.permissions] })),
      platformRoles: p.platformRoles,
      platformPermissions: [...p.platformPermissions],
      creatorPermissions: [...p.creatorPermissions],
    };
  }
}

function cookieHeadersFrom(r: BaResponse): Headers {
  const h = new Headers();
  const cookie = r.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');
  if (cookie) h.set('cookie', cookie);
  return h;
}
