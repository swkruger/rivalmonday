import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';

/**
 * Visual review crawl (`pnpm --filter @cs/web shots:crawl`): every page route on the demo seed, with a measured audit of
 * controls and chart text. Starts nothing: run the dev panel server on DEMO first (`CRAWL_URL`, default localhost:3102).
 * Output: `apps/web/.shots/<SHOTS_LABEL>-crawl/` (PNG per route x viewport, `audit.json`). `CRAWL_ONLY=<regex>` narrows it.
 */
export default defineConfig({
  testDir: './e2e-shots',
  testMatch: 'crawl.spec.ts',
  outputDir: fileURLToPath(new URL('./test-results/crawl-run', import.meta.url)),
  fullyParallel: false,
  workers: 1,
  timeout: 240_000,
  // `next dev` binds IPv4 only and the app redirects to `localhost`, which Chromium may try over IPv6 first.
  use: { baseURL: process.env.CRAWL_URL ?? 'http://localhost:3102', launchOptions: { args: ['--host-resolver-rules=MAP localhost 127.0.0.1'] } },
});
