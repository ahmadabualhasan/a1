import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import type TestAgent from 'supertest/lib/agent';
import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@codek/database';
import { createApp } from '../src/app.factory';
import { PRISMA } from '../src/prisma/prisma.service';
import { EmailService } from '../src/email/email.service';

export const ORIGIN = 'http://localhost:3000';
const rand = () => Math.floor(Math.random() * 250) + 1;

export interface TestContext {
  app: NestExpressApplication;
  prisma: PrismaClient;
  email: EmailService;
  http: () => TestAgent;
}

export async function startApp(): Promise<TestContext> {
  const app = await createApp();
  await app.init();
  const prisma = app.get<PrismaClient>(PRISMA);
  const email = app.get(EmailService);
  return { app, prisma, email, http: () => request(app.getHttpServer()) };
}

/** A logged-in browser-like client: keeps cookies and sends the allowed Origin (CSRF check). */
export class Client {
  cookies: string[] = [];
  private readonly fwd = `10.${rand()}.${rand()}.${rand()}`;
  constructor(private readonly ctx: TestContext) {}

  private withCookies<T extends request.Test>(t: T): T {
    t.set('Origin', ORIGIN);
    t.set('X-Forwarded-For', this.fwd);
    if (this.cookies.length) t.set('Cookie', this.cookies.join('; '));
    return t;
  }

  private capture(res: request.Response): request.Response {
    const set = res.headers['set-cookie'] as unknown as string[] | undefined;
    for (const c of set ?? []) {
      const [pair] = c.split(';');
      const name = pair!.split('=')[0]!;
      this.cookies = this.cookies.filter((x) => !x.startsWith(`${name}=`));
      if (!/=;|Max-Age=0/i.test(c) && pair!.split('=')[1]) this.cookies.push(pair!);
    }
    return res;
  }

  async get(url: string): Promise<request.Response> {
    return this.capture(await this.withCookies(this.ctx.http().get(url)));
  }
  async post(url: string, body?: object, headers: Record<string, string> = {}): Promise<request.Response> {
    const t = this.withCookies(this.ctx.http().post(url));
    for (const [k, v] of Object.entries(headers)) t.set(k, v);
    return this.capture(await t.send(body ?? {}));
  }
  async patch(url: string, body?: object): Promise<request.Response> {
    return this.capture(await this.withCookies(this.ctx.http().patch(url)).send(body ?? {}));
  }
  async put(url: string, body?: object): Promise<request.Response> {
    return this.capture(await this.withCookies(this.ctx.http().put(url)).send(body ?? {}));
  }
  async delete(url: string): Promise<request.Response> {
    return this.capture(await this.withCookies(this.ctx.http().delete(url)));
  }
}

export async function legalIds(ctx: TestContext, role: 'business' | 'creator'): Promise<string[]> {
  const r = await ctx.http().get(`/api/v1/auth/legal-requirements?role=${role}`);
  return (r.body.data as Array<{ id: string }>).map((d) => d.id);
}

export const PASSWORD = 'correct-horse-battery-9';

/** Sign up, verify email via the captured verification email, sign in. */
export async function registerUser(ctx: TestContext, role: 'business' | 'creator', email = `${role}-${randomUUID().slice(0, 8)}@example.com`): Promise<Client> {
  const c = new Client(ctx);
  const su = await c.post('/api/v1/auth/sign-up', { role, email, password: PASSWORD, displayName: `${role} user`, acceptedLegalDocumentIds: await legalIds(ctx, role) });
  if (su.status !== 201) throw new Error(`sign-up failed: ${su.status} ${JSON.stringify(su.body)}`);
  const mail = ctx.email.lastTo(email, 'auth.verify_email');
  const token = new URL(mail!.text.match(/https?:\/\/\S+/)![0]).searchParams.get('token')!;
  const v = await c.post('/api/v1/auth/verify-email', { token });
  if (v.status !== 200) throw new Error(`verify failed: ${v.status} ${JSON.stringify(v.body)}`);
  const si = await c.post('/api/v1/auth/sign-in', { email, password: PASSWORD });
  if (si.status !== 200) throw new Error(`sign-in failed: ${si.status} ${JSON.stringify(si.body)}`);
  (c as Client & { email?: string }).email = email;
  return c;
}

/** Create a platform admin directly (admins cannot self-register) and sign in. */
export async function registerAdmin(ctx: TestContext, roleName = 'platform_admin'): Promise<Client> {
  const email = `admin-${randomUUID().slice(0, 8)}@example.com`;
  const c = await registerUser(ctx, 'creator', email);
  const role = await ctx.prisma.role.findUniqueOrThrow({ where: { name: roleName } });
  const user = await ctx.prisma.user.findUniqueOrThrow({ where: { email } });
  await ctx.prisma.user.update({ where: { id: user.id }, data: { accountType: 'admin' } });
  await ctx.prisma.userRole.deleteMany({ where: { userId: user.id } });
  await ctx.prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
  return c;
}

let seq = 0;
export async function setupBusiness(ctx: TestContext, overrides: Record<string, unknown> = {}): Promise<{ client: Client; businessId: string }> {
  const client = await registerUser(ctx, 'business');
  seq++;
  const r = await client.post('/api/v1/businesses', {
    legalName: `Acme Trading ${seq} LLC`,
    displayName: `Acme ${seq}`,
    category: 'beauty',
    country: 'JO',
    city: 'Amman',
    timezone: 'Asia/Amman',
    websiteUrl: 'https://shop.acme.example',
    ...overrides,
  });
  if (r.status !== 201) throw new Error(`create business failed: ${r.status} ${JSON.stringify(r.body)}`);
  return { client, businessId: r.body.data.id };
}

export async function setupCreator(ctx: TestContext): Promise<{ client: Client; creatorId: string; handle: string }> {
  const client = await registerUser(ctx, 'creator');
  seq++;
  const handle = `creator_${seq}_${Math.floor(Math.random() * 1e6)}`;
  const r = await client.post('/api/v1/creator/profile', { handle, displayName: `Creator ${seq}`, country: 'JO', city: 'Amman', categories: ['beauty'], languages: ['ar', 'en'] });
  if (r.status !== 201) throw new Error(`create creator failed: ${r.status} ${JSON.stringify(r.body)}`);
  return { client, creatorId: r.body.data.id, handle };
}

export function campaignPayload(catalogItemId: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    catalogItemId,
    name: 'Summer Glow Serum Launch',
    description: 'Promote our new vitamin C serum to your audience in Amman.',
    category: 'beauty',
    timezone: 'Asia/Amman',
    participantCap: 5,
    compensationType: 'gift_commission',
    productServiceProvided: true,
    destinationUrl: 'https://shop.acme.example/serum',
    conversionSourceType: 'webhook_api',
    fulfillmentMode: 'online',
    locationCountry: 'JO',
    locationCity: 'Amman',
    platforms: ['instagram', 'tiktok'],
    currency: 'JOD',
    discountConfig: { type: 'percentage', rate: '0.10' },
    commission: { type: 'percentage', rate: '0.15', baseType: 'discounted', roundingMode: 'half_up', refundBehavior: 'clawback' },
    attributionPolicy: { model: 'code_first', windowDays: 30 },
    holdPeriodDays: 14,
    deliverables: [{ type: 'instagram_reel', description: 'One 30s reel', dueDays: 7, required: true }],
    contentRights: { ownership: 'creator', organicAllowed: true, paidAdsAllowed: false, whitelistingAllowed: false, durationDays: 90 },
    promotionRules: { stackable: false, perCustomerLimit: 1 },
    ...overrides,
  };
}

/** Business with a verified status, a catalog item and a published+active campaign. */
export async function setupLiveCampaign(ctx: TestContext, overrides: Record<string, unknown> = {}) {
  const biz = await setupBusiness(ctx);
  await ctx.prisma.business.update({ where: { id: biz.businessId }, data: { verificationStatus: 'verified' } });
  const item = await biz.client.post(`/api/v1/businesses/${biz.businessId}/catalog`, { name: 'Vitamin C Serum', type: 'product', priceMinor: 25000, currency: 'JOD' });
  if (item.status !== 201) throw new Error(`catalog failed ${JSON.stringify(item.body)}`);
  const camp = await biz.client.post(`/api/v1/businesses/${biz.businessId}/campaigns`, campaignPayload(item.body.data.id, overrides));
  if (camp.status !== 201) throw new Error(`campaign failed ${JSON.stringify(camp.body)}`);
  const pub = await biz.client.post(`/api/v1/campaigns/${camp.body.data.id}/publish`);
  if (pub.status !== 200) throw new Error(`publish failed ${JSON.stringify(pub.body)}`);
  return { ...biz, catalogItemId: item.body.data.id as string, campaignId: camp.body.data.id as string, campaign: pub.body.data };
}

/** Live campaign + creator who applied and was accepted → active partnership with assets. */
export async function setupPartnership(ctx: TestContext, campaignOverrides: Record<string, unknown> = {}) {
  const live = await setupLiveCampaign(ctx, campaignOverrides);
  const creator = await setupCreator(ctx);
  const app = await creator.client.post(`/api/v1/campaigns/${live.campaignId}/apply`, { message: 'I love this product' });
  if (app.status !== 201) throw new Error(`apply failed ${JSON.stringify(app.body)}`);
  const acc = await live.client.post(`/api/v1/applications/${app.body.data.id}/accept`);
  if (acc.status !== 200) throw new Error(`accept failed ${JSON.stringify(acc.body)}`);
  return {
    live,
    creator,
    applicationId: app.body.data.id as string,
    partnershipId: acc.body.data.partnership.id as string,
    code: acc.body.data.assets.code as string,
    referralToken: acc.body.data.assets.token as string,
  };
}
