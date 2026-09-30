import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { newUserPage, signIn, signUp, uniqueEmail } from './support';

/** WCAG 2.1 A/AA checks with axe on key screens; serious and critical violations fail the build. */
async function expectAccessible(page: Page, label: string) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  const blocking = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(blocking.map((v) => `${label}: ${v.id} (${v.impact}) — ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(', ')}`)).toEqual([]);
}

test.describe('accessibility', () => {
  for (const path of ['/', '/how-it-works', '/pricing', '/marketplace', '/sign-in', '/sign-up', '/faq', '/terms']) {
    test(`public ${path} has no serious WCAG violations @mobile`, async ({ page }) => {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      await expectAccessible(page, path);
    });
  }

  test('signed-in creator screens have no serious WCAG violations', async ({ browser }) => {
    const page = await newUserPage(browser);
    const email = uniqueEmail('a11y-creator');
    await signUp(page, 'creator', 'A11y Creator', email);
    await signIn(page, email);
    await expect(page.getByRole('heading', { name: 'Set up your creator profile' })).toBeVisible();
    await expect(page).toHaveTitle('Set up your creator profile · CODEK Creator');
    await expectAccessible(page, '/creator/onboarding');
    await page.getByLabel('Handle').fill(`a11y_${Date.now().toString(36)}`);
    await page.getByRole('button', { name: 'Create profile' }).click();
    await expect(page).toHaveURL(/\/creator$/);
    for (const path of ['/creator', '/creator/marketplace', '/creator/payouts', '/creator/profile', '/notifications', '/account/security']) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
      await expectAccessible(page, path);
    }
    await page.goto('/creator/payouts');
    await expect(page).toHaveTitle('Payouts · CODEK Creator');
    await page.goto('/notifications');
    await expect(page).toHaveTitle('Notifications · CODEK Creator');
    await page.context().close();
  });

  test('signed-in business screens have no serious WCAG violations', async ({ browser }) => {
    const page = await newUserPage(browser);
    const email = uniqueEmail('a11y-biz');
    await signUp(page, 'business', 'A11y Business', email);
    await signIn(page, email);
    await expect(page.getByRole('heading', { name: 'Set up your business' })).toBeVisible();
    await expect(page).toHaveTitle('Set up your business · CODEK Business');
    await expectAccessible(page, '/business/onboarding');
    await page.getByLabel('Legal name').fill('A11y Co');
    await page.getByLabel('Display name').fill('A11y Co');
    await page.getByLabel('Category').fill('retail');
    await page.getByLabel('Country (2-letter code)').fill('JO');
    await page.getByLabel('Website').fill('https://a11y.example.com');
    await page.getByRole('button', { name: 'Create business' }).click();
    await expect(page).toHaveURL(/\/business$/);
    for (const path of ['/business', '/business/campaigns/new', '/business/catalog', '/business/sales', '/business/funding', '/business/integrations']) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
      await expectAccessible(page, path);
    }
    await page.goto('/business/funding');
    await expect(page).toHaveTitle('Funding · CODEK Business');
    await page.context().close();
  });
});
