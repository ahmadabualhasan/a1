import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const email = z.email().max(254).transform((e) => e.trim().toLowerCase());
const password = z.string().min(10, 'Password must be at least 10 characters').max(128);

export const signUpSchema = z.object({
  role: z.enum(['business', 'creator']),
  email,
  password,
  displayName: z.string().trim().min(2).max(80),
  acceptedLegalDocumentIds: z.array(z.uuid()).min(1).max(20),
});
export class SignUpDto extends createZodDto(signUpSchema) {}

export class SignInDto extends createZodDto(z.object({ email, password: z.string().min(1).max(128) })) {}
export class EmailOnlyDto extends createZodDto(z.object({ email })) {}
export class VerifyEmailDto extends createZodDto(z.object({ token: z.string().min(10).max(2048) })) {}
export class ResetPasswordDto extends createZodDto(z.object({ token: z.string().min(10).max(2048), newPassword: password })) {}
export class ChangePasswordDto extends createZodDto(
  z.object({ currentPassword: z.string().min(1).max(128), newPassword: password, revokeOtherSessions: z.boolean().default(true) }),
) {}
export class PasswordDto extends createZodDto(z.object({ password: z.string().min(1).max(128) })) {}
export class TotpCodeDto extends createZodDto(z.object({ code: z.string().regex(/^\d{6}$/), trustDevice: z.boolean().optional() })) {}
export class BackupCodeDto extends createZodDto(z.object({ code: z.string().min(6).max(64) })) {}
