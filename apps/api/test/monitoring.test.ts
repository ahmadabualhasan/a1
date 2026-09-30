import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { JobsService } from '../src/jobs/jobs.service';
import { MetricsService } from '../src/observability/metrics.service';
import { startApp, type TestContext } from './harness';

let ctx: TestContext;
beforeAll(async () => {
  ctx = await startApp();
});
afterAll(async () => ctx.app.close());

describe('monitoring', () => {
  it('every metric referenced by the alert rules is exported by the API', async () => {
    const rules = readFileSync(path.resolve(__dirname, '../../../infra/monitoring/alerts.yml'), 'utf8');
    const referenced = [...new Set([...rules.matchAll(/codek_[a-z0-9_]+/g)].map((m) => m[0].replace(/_(bucket|count|sum)$/, '')))];
    expect(referenced.length).toBeGreaterThan(8);
    await ctx.app.get(MetricsService).collectOperational();
    await ctx.app.get(JobsService).checkLedger();
    await ctx.http().get('/api/v1/health/live');
    const res = await ctx.http().get('/api/v1/metrics');
    expect(res.status).toBe(200);
    const missing = referenced.filter((m) => !new RegExp(`^# TYPE ${m} `, 'm').test(res.text));
    expect(missing).toEqual([]);
  });
});
