import { expect, test } from '@playwright/test';

test.describe('public site', () => {
  test('home, pricing and legal pages render with honest positioning @mobile', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /Creator partnerships that pay on verified sales/ })).toBeVisible();
    await expect(page.getByText(/no platform can attribute every sale/i)).toBeVisible();
    await page.goto('/pricing');
    await expect(page.getByText('No CODEK fee on commissions')).toBeVisible();
    await page.goto('/terms');
    await expect(page.getByRole('heading', { name: 'Terms of Service' })).toBeVisible();
  });

  test('protected areas redirect to sign-in', async ({ page }) => {
    await page.goto('/account/security');
    await expect(page).toHaveURL(/\/sign-in\?next=/);
  });

  test('security headers are present', async ({ request }) => {
    const r = await request.get('/');
    expect(r.headers()['x-frame-options']).toBe('DENY');
    expect(r.headers()['content-security-policy']).toContain("frame-ancestors 'none'");
  });
});
