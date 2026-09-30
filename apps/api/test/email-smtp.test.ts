import { createServer, type Server, type Socket } from 'node:net';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadEnv } from '@codek/config';
import { EmailService } from '../src/email/email.service';

/** Minimal in-process SMTP server (plain, no auth) that records the transaction. */
function smtpServer(received: Array<{ from: string; to: string[]; data: string }>): Server {
  return createServer((socket: Socket) => {
    let mail = { from: '', to: [] as string[], data: '' };
    let inData = false;
    let buffer = '';
    socket.write('220 test ESMTP\r\n');
    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      let idx: number;
      while ((idx = buffer.indexOf('\r\n')) >= 0) {
        const line = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        if (inData) {
          if (line === '.') {
            inData = false;
            received.push(mail);
            mail = { from: '', to: [], data: '' };
            socket.write('250 OK queued\r\n');
          } else mail.data += `${line}\n`;
          continue;
        }
        const cmd = line.slice(0, 4).toUpperCase();
        if (cmd === 'EHLO' || cmd === 'HELO') socket.write('250-test\r\n250 8BITMIME\r\n');
        else if (cmd === 'MAIL') { mail.from = line; socket.write('250 OK\r\n'); }
        else if (cmd === 'RCPT') { mail.to.push(line); socket.write('250 OK\r\n'); }
        else if (cmd === 'DATA') { inData = true; socket.write('354 End with .\r\n'); }
        else if (cmd === 'QUIT') { socket.end('221 Bye\r\n'); }
        else socket.write('250 OK\r\n');
      }
    });
  });
}

describe('email (smtp driver)', () => {
  const received: Array<{ from: string; to: string[]; data: string }> = [];
  let server: Server;
  let port = 0;
  beforeAll(async () => {
    server = smtpServer(received);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    port = (server.address() as AddressInfo).port;
  });
  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  it('delivers through SMTP with the configured sender and never uses the in-memory outbox', async () => {
    const env = loadEnv({ ...process.env, EMAIL_DRIVER: 'smtp', SMTP_HOST: '127.0.0.1', SMTP_PORT: String(port), SMTP_SECURE: 'false', EMAIL_FROM: 'CODEK <no-reply@codek.test>' }, { cache: false });
    const email = new EmailService(env);
    await email.send({ to: 'someone@example.com', subject: 'Verify your email', text: 'Open https://codek.test/verify?token=abc', template: 'auth.verify_email' });
    expect(received).toHaveLength(1);
    expect(received[0]!.from).toContain('no-reply@codek.test');
    expect(received[0]!.to.join()).toContain('someone@example.com');
    expect(received[0]!.data).toContain('Subject: Verify your email');
    expect(received[0]!.data).toContain('https://codek.test/verify?token=abc');
    expect(email.outbox).toHaveLength(0);
  });
});
