import { expect, test, type Page } from '@playwright/test';
import { grantPlatformRole, newUserPage, signIn, signUp, uniqueEmail } from './support';

/**
 * Full marketplace journey through the real UI and API:
 * business onboarding → campaign → admin review → creator application → acceptance → code →
 * counter redemption → sale approval → creator sees the approved commission.
 */
test.describe.serial('creator–business journey', () => {
  const businessEmail = uniqueEmail('biz');
  const creatorEmail = uniqueEmail('creator');
  const adminEmail = uniqueEmail('admin');
  const handle = `e2e_${Date.now().toString(36)}`;
  const campaignName = `Burger Week ${handle}`;
  let campaignId = '';
  let code = '';
  let business: Page;
  let creator: Page;
  let admin: Page;

  test.afterAll(async () => {
    for (const p of [business, creator, admin]) await p?.context().close();
  });

  test('business signs up, onboards, adds a product and submits a campaign', async ({ browser }) => {
    business = await newUserPage(browser);
    await signUp(business, 'business', 'Rana Business', businessEmail);
    await signIn(business, businessEmail);
    await expect(business).toHaveURL(/\/business\/onboarding/);
    await business.getByLabel('Legal name').fill('Rana Foods LLC');
    await business.getByLabel('Display name').fill('Rana Burgers');
    await business.getByLabel('Category').fill('restaurant');
    await business.getByLabel('Country (2-letter code)').fill('JO');
    await business.getByLabel('Website').fill('https://rana.example.com');
    await business.getByRole('button', { name: 'Create business' }).click();
    await expect(business).toHaveURL(/\/business$/);

    await business.goto('/business/catalog');
    await business.getByLabel('Name').fill('Signature Burger');
    await business.getByLabel('Price').fill('5.500');
    await business.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(business.getByRole('cell', { name: 'Signature Burger' })).toBeVisible();

    await business.goto('/business/campaigns/new');
    await business.getByLabel('Product or service').selectOption({ label: 'Signature Burger' });
    await business.getByLabel('Campaign name').fill(campaignName);
    await business.getByLabel('Category').fill('food');
    await business.getByLabel('Description', { exact: true }).fill('Promote our signature burger to food lovers in Amman this month.');
    await business.getByLabel('Link where customers buy or book').fill('https://rana.example.com/menu');
    await business.getByRole('button', { name: 'Save draft' }).click();
    await business.waitForURL(/\/business\/campaigns\/[0-9a-f-]{36}$/);
    campaignId = business.url().split('/').pop()!;
    await business.getByRole('button', { name: 'Publish' }).click();
    await expect(business.getByText('Submitted for review')).toBeVisible();
  });

  test('admin reviews and approves the campaign', async ({ browser }) => {
    admin = await newUserPage(browser);
    await signUp(admin, 'creator', 'Ops Reviewer', adminEmail);
    await grantPlatformRole(adminEmail);
    await signIn(admin, adminEmail);
    await expect(admin).toHaveURL(/\/admin$/);
    await admin.goto('/admin/campaigns');
    const row = admin.getByRole('row', { name: new RegExp(campaignName) });
    await row.getByRole('button', { name: 'Approve' }).click();
    await expect(admin.getByText('Approved and published.')).toBeVisible();
  });

  test('creator signs up, builds a profile and applies', async ({ browser }) => {
    creator = await newUserPage(browser);
    await signUp(creator, 'creator', 'Lina Eats', creatorEmail);
    await signIn(creator, creatorEmail);
    await expect(creator).toHaveURL(/\/creator\/onboarding/);
    await creator.getByLabel('Handle').fill(handle);
    await creator.getByRole('button', { name: 'Create profile' }).click();
    await expect(creator).toHaveURL(/\/creator$/);

    await creator.goto('/creator/marketplace');
    await expect(creator.getByRole('link', { name: new RegExp(campaignName) })).toHaveAttribute('href', `/creator/marketplace/${campaignId}`);
    await creator.goto(`/creator/marketplace/${campaignId}`);
    await expect(creator.getByRole('heading', { name: campaignName })).toBeVisible();
    await creator.getByLabel('Message to the business').fill('I post weekly food reviews in Amman.');
    await creator.getByRole('button', { name: 'Apply to this campaign' }).click();
    await expect(creator.getByText('Application sent!')).toBeVisible();
    await creator.goto('/creator/applications');
    await expect(creator.getByRole('row', { name: new RegExp(campaignName) })).toContainText('Pending');
  });

  test('business accepts the application', async () => {
    await business.goto('/business/applications');
    await expect(business.getByText('I post weekly food reviews in Amman.')).toBeVisible();
    await business.getByRole('button', { name: 'Accept' }).click();
    await business.goto(`/business/campaigns/${campaignId}`);
    await business.getByRole('tab', { name: 'Creators' }).click();
    await expect(business.getByRole('link', { name: `@${handle}` })).toBeVisible();
  });

  test('creator gets a unique code, link and agreed terms', async () => {
    const assets = await creator.request.get('/api/v1/creator/promotion-assets');
    expect(assets.ok()).toBe(true);
    const body = (await assets.json()) as { data: Array<{ codes: Array<{ code: string }>; partnershipId: string }> };
    code = body.data[0]!.codes[0]!.code;
    expect(code).toMatch(/^[A-Z0-9-]{4,}$/);
    await creator.goto(`/creator/partnerships/${body.data[0]!.partnershipId}`);
    await expect(creator.getByText(code)).toBeVisible();
    await expect(creator.getByText('Agreed terms')).toBeVisible();
  });

  test('business records a counter redemption and approves the sale', async () => {
    await business.goto('/business/sales');
    await business.getByRole('tab', { name: 'Record at counter' }).click();
    await business.getByLabel('Creator code').fill(code);
    await business.getByLabel('Order / receipt number').fill(`R-${Date.now()}`);
    await business.getByLabel('Amount paid before discount').fill('5.500');
    await business.getByRole('button', { name: 'Record redemption' }).click();
    await expect(business.getByText(/^Recorded\./)).toBeVisible();
    await business.getByRole('tab', { name: 'Sales', exact: true }).click();
    await business.getByRole('button', { name: 'Approve' }).first().click();
    await expect(business.getByRole('button', { name: 'Approve' })).toHaveCount(0);
  });

  test('creator sees the sale and the approved commission', async () => {
    await creator.goto('/creator/sales');
    await expect(creator.getByRole('table')).toContainText('Approved');
    await expect(creator.getByRole('table')).toContainText('0.550 JOD');
    await creator.goto('/creator/earnings');
    const card = creator.locator('section, div').filter({ has: creator.getByText('Earnings in JOD') }).first();
    await expect(card).toContainText('Approved');
    await expect(card).toContainText('0.550 JOD');
  });

  test('tenant isolation: the creator cannot open business pages or another tenant’s data', async () => {
    await creator.goto('/business');
    await expect(creator.getByText('This area is for business accounts.')).toBeVisible();
    const res = await creator.request.get(`/api/v1/businesses/${(await (await business.request.get('/api/v1/businesses')).json()).data[0].id}`);
    expect([403, 404]).toContain(res.status());
  });
});
