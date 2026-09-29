import { defineConfig, devices } from '@playwright/test';

/**
 * E2E runs against real servers: the built API (with PostgreSQL + Redis) and the built web app.
 * Email verification is disabled for E2E runs only (sign-up signs the user in directly).
 */
const apiEnv = { ...process.env, APP_ENV: 'test', AUTH_REQUIRE_EMAIL_VERIFICATION: 'false', RATE_LIMIT_MAX: '100000', API_PORT: '4000', WEB_PUBLIC_URL: 'http://localhost:3000', CORS_ALLOWED_ORIGINS: 'http://localhost:3000', API_PUBLIC_URL: 'http://localhost:3000', TRACKING_PUBLIC_URL: 'http://localhost:3000' } as Record<string, string>;

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure',
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : undefined,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, grep: /@mobile/ },
  ],
  webServer: [
    { command: 'node ../api/dist/main.js', url: 'http://localhost:4000/api/v1/health/live', reuseExistingServer: !process.env.CI, env: apiEnv, timeout: 60_000 },
    { command: 'pnpm exec next start -p 3000', url: 'http://localhost:3000', reuseExistingServer: !process.env.CI, env: { ...process.env, API_INTERNAL_URL: 'http://localhost:4000' } as Record<string, string>, timeout: 60_000 },
  ],
});
