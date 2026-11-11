// Creates demo accounts (business, creator, admin) for the LOCAL DEMO only. Idempotent.
// Refuses to run outside APP_ENV=development. Credentials are written to .demo/ACCOUNTS.txt (git-ignored).
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const publicUrl = process.argv[2] ?? 'http://localhost:3000';
const api = 'http://localhost:4000/api/v1';
if ((process.env.APP_ENV ?? 'development') !== 'development') throw new Error('demo accounts are for APP_ENV=development only');

const file = path.join(root, '.demo/ACCOUNTS.txt');
const saved = existsSync(file) ? /Password: (\S+)/.exec(readFileSync(file, 'utf8'))?.[1] : undefined;
const password = saved ?? `Demo-${randomBytes(9).toString('base64url')}`;
const accounts = [
  { role: 'business', email: 'business@demo.codek.local', displayName: 'Demo Business' },
  { role: 'creator', email: 'creator@demo.codek.local', displayName: 'Demo Creator' },
  { role: 'creator', email: 'admin@demo.codek.local', displayName: 'Demo Admin', admin: true },
];

const headers = { 'content-type': 'application/json', origin: publicUrl };
for (const a of accounts) {
  const legal = await (await fetch(`${api}/auth/legal-requirements?role=${a.role}`)).json();
  const res = await fetch(`${api}/auth/sign-up`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ role: a.role, email: a.email, password, displayName: a.displayName, acceptedLegalDocumentIds: legal.data.map((d) => d.id) }),
  });
  const body = await res.json().catch(() => ({}));
  if (res.status === 201) console.log(`[demo] ensured ${a.email}`);
  else console.log(`[demo] ${a.email}: ${body?.error?.code ?? res.status} (kept as is)`);
}

// Admin: mark the demo admin's email verified, then use the audited bootstrap script.
const require = createRequire(path.join(root, 'apps/api/package.json'));
require('dotenv').config({ path: path.join(root, '.env'), quiet: true });
const { createPrismaClient } = require('@codek/database');
const prisma = createPrismaClient({ connectionString: process.env.DATABASE_URL, max: 1 });
try {
  await prisma.user.updateMany({ where: { email: { in: accounts.map((a) => a.email) } }, data: { emailVerified: true } });
} finally {
  await prisma.$disconnect();
}
const r = spawnSync('node', ['dist/scripts/create-admin.js'], {
  cwd: path.join(root, 'apps/api'),
  env: { ...process.env, ADMIN_EMAIL: 'admin@demo.codek.local', ADMIN_ROLE: 'platform_admin', ADMIN_REASON: 'local demo environment bootstrap' },
  encoding: 'utf8',
});
if (r.status !== 0) throw new Error(`admin bootstrap failed: ${r.stderr}`);

writeFileSync(
  file,
  `CODEK demo accounts (local demo only)\nWebsite: ${publicUrl}\nPassword: ${password}\n\n` +
    accounts.map((a) => `${a.displayName}: ${a.email}`).join('\n') +
    '\n\nYou can also sign up with new accounts from the website.\n',
);
console.log(`[demo] accounts ready (${file})`);
