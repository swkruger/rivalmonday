import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';

try {
  process.loadEnvFile(fileURLToPath(new URL('../../.env', import.meta.url)));
} catch {
  // optional
}
const PORT = 3200;
// The panel needs Origin to equal Host, and Next reports the request origin as localhost even when the launcher binds 127.0.0.1.
const ORIGIN = `http://localhost:${PORT}`;

/**
 * Spec §8 panel E2E: a `next dev` server with the panel on. It runs against the real cs_demo (it resets it) and
 * keeps its live-environment choice in its own file, so the owner's `.dev-env.json` is never touched.
 * Never run it at the same time as `pnpm --filter @cs/web e2e` (both use `.next`).
 */
export default defineConfig({
  testDir: './e2e-panel',
  fullyParallel: false,
  workers: 1,
  timeout: 900_000,
  expect: { timeout: 30_000 },
  use: { baseURL: ORIGIN },
  webServer: {
    command: `pnpm exec tsx scripts/dev.ts --env dev --port ${PORT}`,
    url: `${ORIGIN}/health`,
    timeout: 300_000,
    reuseExistingServer: false,
    env: { APP_URL: ORIGIN, RM_DEV_ENV_FILE: fileURLToPath(new URL('./test-results/panel/dev-env.json', import.meta.url)) },
  },
});
