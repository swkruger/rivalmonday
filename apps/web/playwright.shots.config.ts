import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';
import { E2E_SERVER_ENV } from './playwright.config';

const PORT = Number(process.env.E2E_PORT ?? 3100);

/** `E2E_SKIP_BUILD=1` only starts the server (same switch as `playwright.config.ts`). */
const BUILD = process.env.E2E_SKIP_BUILD === '1' ? '' : 'pnpm build && pnpm check:no-dev-panel && ';

/**
 * Phase 16 screenshot + axe harness (`pnpm --filter @cs/web shots`, `SHOTS_LABEL=before|after`). Same server, seed and
 * port as the E2E config, so never run it alongside `e2e`. `e2e`, `e2e:affected` and CI never match `e2e-shots/`.
 * `outputDir` is its own folder: Playwright empties it at the start of a run, which must not delete earlier shots.
 */
export default defineConfig({
  testDir: './e2e-shots',
  outputDir: fileURLToPath(new URL('./test-results/shots-run', import.meta.url)),
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 180_000,
  expect: { timeout: 15_000 },
  use: { baseURL: `http://localhost:${PORT}` },
  webServer: {
    command: `${BUILD}pnpm start --port ${PORT}`,
    url: `http://localhost:${PORT}/health`,
    timeout: 300_000,
    reuseExistingServer: false,
    env: E2E_SERVER_ENV,
  },
});
