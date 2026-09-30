import { defineConfig } from 'vitest/config';
import base from './vitest.config';

/** Load/soak scenarios (`pnpm --filter @codek/api test:load`): excluded from the regular suite. */
export default defineConfig({ ...base, test: { ...base.test, include: ['test/load/**/*.load.ts'], testTimeout: 600_000 } });
