import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, type Browser, type Page } from '@playwright/test';
import { createPrismaClient } from '@codek/database';

/** DATABASE_URL from the environment (CI) or the repository .env (local runs). */
function databaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const env = readFileSync(resolve(__dirname, '../../../.env'), 'utf8');
  const m = env.match(/^DATABASE_URL=(.+)$/m);
  if (!m) throw new Error('DATABASE_URL is not configured for E2E');
  return m[1]!.trim().replace(/^"|"$/g, '');
}

/** Test-only privilege grant, mirroring the API integration harness (there is no self-service path to admin). */
export async function grantPlatformRole(email: string, role = 'platform_admin'): Promise<void> {
  const url = databaseUrl();
  if (!/\/codek_(e2e|test|ci)(\?|$)/.test(url)) throw new Error(`Refusing to modify a non-test database: ${url.replace(/\/\/.*@/, '//***@')}`);
  const prisma = createPrismaClient({ connectionString: url, max: 1 });
  try {
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    const r = await prisma.role.findUniqueOrThrow({ where: { name: role } });
    await prisma.user.update({ where: { id: user.id }, data: { accountType: 'admin' } });
    await prisma.userRole.deleteMany({ where: { userId: user.id } });
    await prisma.userRole.create({ data: { userId: user.id, roleId: r.id } });
  } finally {
    await prisma.$disconnect();
  }
}

export const PASSWORD = 'correct-horse-battery-9';
export const uniqueEmail = (prefix: string) => `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}@example.com`;

export async function signUp(page: Page, role: 'business' | 'creator', name: string, email: string): Promise<void> {
  await page.goto(`/sign-up?role=${role}`);
  await page.getByLabel(role === 'business' ? 'Your name' : 'Display name').fill(name);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();
}

export async function signIn(page: Page, email: string): Promise<void> {
  await page.goto('/sign-in');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/sign-in'));
}

export async function newUserPage(browser: Browser): Promise<Page> {
  const ctx = await browser.newContext();
  return ctx.newPage();
}
