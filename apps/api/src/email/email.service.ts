import { Inject, Injectable, Logger } from '@nestjs/common';
import nodemailer, { type Transporter } from 'nodemailer';
import type { Env } from '@codek/config';
import { ENV } from '../config/config.module';

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
  /** Classification for logs/metrics, e.g. "auth.verify_email". */
  template: string;
}

/**
 * Email delivery abstraction. Drivers: `log` (development/test only — refused in production by config validation)
 * and `smtp` (CREDENTIAL_REQUIRED). The log driver keeps an in-memory outbox that tests can inspect.
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger('EmailService');
  private transporter?: Transporter;
  /** Last messages sent through the log driver (bounded, test/dev only). */
  readonly outbox: EmailMessage[] = [];

  constructor(@Inject(ENV) private readonly env: Env) {
    if (env.EMAIL_DRIVER === 'smtp') {
      this.transporter = nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT ?? 587,
        secure: env.SMTP_SECURE,
        auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined,
      });
    }
  }

  async send(msg: EmailMessage): Promise<void> {
    if (this.env.EMAIL_DRIVER === 'log') {
      this.outbox.push(msg);
      if (this.outbox.length > 200) this.outbox.shift();
      // Development convenience: the body contains the action link. Never enabled in production.
      this.logger.log({ template: msg.template, to: maskEmail(msg.to), subject: msg.subject }, 'email (log driver)');
      if (this.env.APP_ENV === 'development') this.logger.debug(msg.text);
      return;
    }
    await this.transporter!.sendMail({ from: this.env.EMAIL_FROM, to: msg.to, subject: msg.subject, text: msg.text, html: msg.html });
    this.logger.log({ template: msg.template, to: maskEmail(msg.to) }, 'email sent');
  }

  lastTo(to: string, template?: string): EmailMessage | undefined {
    return [...this.outbox].reverse().find((m) => m.to === to && (!template || m.template === template));
  }
}

export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return '***';
  return `${local!.slice(0, 1)}***@${domain}`;
}
