import { defineConfig } from 'vitest/config';

/**
 * Pure script tests without the web package's database global setup (which resets `cs_test`):
 * `pnpm --filter @cs/web exec vitest run --config scripts/vitest.scripts.config.ts`.
 */
export default defineConfig({
  test: { include: ['scripts/e2e-affected*.test.ts'] },
});
