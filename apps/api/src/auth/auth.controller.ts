import { Body, Controller, Get, HttpCode, Post, Query, Req, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { RateLimit } from '../common/rate-limit';
import { AllowUnverified, CurrentPrincipal, OptionalPrincipal, Public } from './decorators';
import { AuthService } from './auth.service';
import {
  BackupCodeDto,
  ChangePasswordDto,
  EmailOnlyDto,
  PasswordDto,
  ResetPasswordDto,
  SignInDto,
  SignUpDto,
  TotpCodeDto,
  VerifyEmailDto,
} from './auth.dto';
import type { Principal } from './principal';

/** Spec §20.2 auth routes. Cookie-based DB sessions (HttpOnly, SameSite=Lax, Secure outside development). */
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Get('legal-requirements')
  async legalRequirements(@Query('role') role: string) {
    const r = z.enum(['business', 'creator']).parse(role);
    const docs = await this.auth.requiredLegalDocuments(r);
    return docs.map((d) => ({ id: d.id, documentType: d.documentType, version: d.version, title: d.title }));
  }

  @Public()
  @RateLimit({ bucket: 'auth.sign-up', limit: 10, windowSeconds: 3600, by: 'ip' })
  @Post('sign-up')
  @HttpCode(201)
  signUp(@Body() dto: SignUpDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.auth.signUp(dto, req.headers, res);
  }

  @Public()
  @RateLimit({ bucket: 'auth.sign-in', limit: 10, windowSeconds: 300, by: 'ip' })
  @Post('sign-in')
  @HttpCode(200)
  signIn(@Body() dto: SignInDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.auth.signIn(dto.email, dto.password, req.headers, res);
  }

  @Public()
  @Post('sign-out')
  @HttpCode(200)
  async signOut(@Req() req: Request, @Res({ passthrough: true }) res: Response, @OptionalPrincipal() p?: Principal) {
    await this.auth.signOut(req.headers, res, p);
    return { status: 'signed_out' };
  }

  @Public()
  @RateLimit({ bucket: 'auth.verify-email', limit: 20, windowSeconds: 3600, by: 'ip' })
  @Post('verify-email')
  @HttpCode(200)
  async verifyEmail(@Body() dto: VerifyEmailDto) {
    await this.auth.verifyEmail(dto.token);
    return { status: 'verified' };
  }

  @Public()
  @RateLimit({ bucket: 'auth.resend', limit: 5, windowSeconds: 3600, by: 'ip' })
  @Post('resend-verification')
  @HttpCode(200)
  async resend(@Body() dto: EmailOnlyDto) {
    await this.auth.resendVerification(dto.email);
    return { status: 'sent_if_applicable' };
  }

  @Public()
  @RateLimit({ bucket: 'auth.forgot', limit: 5, windowSeconds: 3600, by: 'ip' })
  @Post('forgot-password')
  @HttpCode(200)
  async forgot(@Body() dto: EmailOnlyDto) {
    await this.auth.forgotPassword(dto.email);
    return { status: 'sent_if_applicable' };
  }

  @Public()
  @RateLimit({ bucket: 'auth.reset', limit: 10, windowSeconds: 3600, by: 'ip' })
  @Post('reset-password')
  @HttpCode(200)
  async reset(@Body() dto: ResetPasswordDto) {
    await this.auth.resetPassword(dto.token, dto.newPassword);
    return { status: 'password_reset' };
  }

  @AllowUnverified()
  @Get('session')
  session(@CurrentPrincipal() p: Principal) {
    return this.auth.sessionView(p);
  }

  @Post('change-password')
  @HttpCode(200)
  async changePassword(@CurrentPrincipal() p: Principal, @Body() dto: ChangePasswordDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.auth.changePassword(p, req.headers, res, dto.currentPassword, dto.newPassword, dto.revokeOtherSessions);
    return { status: 'password_changed' };
  }

  @Get('sessions')
  sessions(@CurrentPrincipal() p: Principal) {
    return this.auth.listSessions(p);
  }

  @Post('sessions/revoke-others')
  @HttpCode(200)
  async revokeOthers(@CurrentPrincipal() p: Principal, @Req() req: Request) {
    await this.auth.revokeOtherSessions(p, req.headers);
    return { status: 'revoked' };
  }

  @RateLimit({ bucket: 'auth.mfa', limit: 10, windowSeconds: 300 })
  @Post('mfa/enable')
  @HttpCode(200)
  mfaEnable(@CurrentPrincipal() p: Principal, @Body() dto: PasswordDto, @Req() req: Request) {
    return this.auth.mfaEnable(p, dto.password, req.headers);
  }

  /** Confirms MFA setup (authenticated) or completes a sign-in that requires a second factor (two-factor cookie). */
  @Public()
  @RateLimit({ bucket: 'auth.mfa-verify', limit: 10, windowSeconds: 300, by: 'ip' })
  @Post('mfa/verify')
  @HttpCode(200)
  async mfaVerify(@Body() dto: TotpCodeDto, @Req() req: Request, @Res({ passthrough: true }) res: Response, @OptionalPrincipal() p?: Principal) {
    await this.auth.mfaVerify(dto.code, req.headers, res, dto.trustDevice ?? false, p);
    return { status: 'verified' };
  }

  @Public()
  @RateLimit({ bucket: 'auth.mfa-backup', limit: 5, windowSeconds: 300, by: 'ip' })
  @Post('mfa/verify-backup-code')
  @HttpCode(200)
  async mfaBackup(@Body() dto: BackupCodeDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.auth.mfaVerifyBackupCode(dto.code, req.headers, res);
    return { status: 'verified' };
  }

  @Post('mfa/disable')
  @HttpCode(200)
  async mfaDisable(@CurrentPrincipal() p: Principal, @Body() dto: PasswordDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.auth.mfaDisable(p, dto.password, req.headers, res);
    return { status: 'disabled' };
  }
}
