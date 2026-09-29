import 'reflect-metadata';
import path from 'node:path';
import { config } from 'dotenv';

config({ path: path.resolve(__dirname, '../../../.env'), quiet: true });
const url = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? '';
if (!/test|e2e|ci/i.test(new URL(url).pathname)) throw new Error('Refusing to run API tests against a non-test database');
process.env.DATABASE_URL = url;
process.env.APP_ENV = 'test';
process.env.NODE_ENV = 'test';
process.env.EMAIL_DRIVER = 'log';
process.env.PAYOUT_PROVIDER = 'sandbox';
process.env.AUTH_REQUIRE_EMAIL_VERIFICATION = 'true';
process.env.QUEUE_PREFIX = 'codek-test';
process.env.RATE_LIMIT_MAX = '10000';
process.env.STORAGE_DRIVER = 'local';
process.env.STORAGE_LOCAL_DIR = path.resolve(__dirname, '../../../storage-data/test');
process.env.WEB_PUBLIC_URL = 'http://localhost:3000';
process.env.CORS_ALLOWED_ORIGINS = 'http://localhost:3000';
// Each test client gets its own X-Forwarded-For so per-IP rate limits behave like distinct users.
process.env.TRUST_PROXY = 'true';
