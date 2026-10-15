import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';

try {
  process.loadEnvFile(fileURLToPath(new URL('../../.env', import.meta.url)));
} catch {
  // optional
}
const PORT = 3100;
export const OUTBOX = fileURLToPath(new URL('./test-results/outbox', import.meta.url));
export const OWNER_LINK_FILE = fileURLToPath(new URL('./test-results/owner-link.txt', import.meta.url));
/** Phase 6a: the two clients the seeded `mcp-owner@e2e.test` owns (`{ first, second }`, each `{ id, name }`). */
export const MCP_CLIENTS_FILE = fileURLToPath(new URL('./test-results/mcp-clients.json', import.meta.url));
/** Phase 6b: the Ask clients and seeded thread ids (`AskFixture` in `e2e/seed.ts`). */
export const ASK_FIXTURE_FILE = fileURLToPath(new URL('./test-results/ask-fixture.json', import.meta.url));
/** Phase 12a: the seeded Rivals client's id (`RivalsFixture` in `e2e/seed.ts`). */
export const RIVALS_FIXTURE_FILE = fileURLToPath(new URL('./test-results/rivals-fixture.json', import.meta.url));
export const E2E_LINK_SECRET = 'e2e-link-secret-'.repeat(3);

/**
 * The production server's environment. Exported so `scripts/e2e-affected.ts` builds with exactly what the webServer
 * builds with (a build bakes some of it in).
 */
export const E2E_SERVER_ENV: Record<string, string> = {
  APP_URL: `http://localhost:${PORT}`,
  // A production server must ignore this (spec 5.3).
  DEV_PANEL: '1',
  APP_DATABASE_URL: process.env.TEST_APP_DATABASE_URL!,
  SERVICE_DATABASE_URL: process.env.TEST_SERVICE_DATABASE_URL!,
  DATABASE_URL: process.env.TEST_DATABASE_URL!,
  BETTER_AUTH_SECRET: 'e2e-auth-secret-'.repeat(3),
  LINK_SIGNING_SECRET: E2E_LINK_SECRET,
  EMAIL_FROM: 'e2e@example.com',
  EMAIL_OUTBOX_DIR: OUTBOX,
  POSTMARK_SERVER_TOKEN: '',
  GOOGLE_CLIENT_ID: '',
  DEFAULT_AGENCY_ID: '',
  WEB_MONITORING_ENABLED: '',
  KB_IMPORT_ENABLED: '',
  PLATFORM_ADMIN_EMAILS: 'admin@e2e.test',
  EVIDENCE_FS_DIR: fileURLToPath(new URL('./test-results/evidence', import.meta.url)),
  // 6b Q1: Ask answers from a deterministic script (never OpenRouter); refused when VERCEL_ENV=production.
  ASK_FAKE_AI: '1',
};

/** `E2E_SKIP_BUILD=1` (set by `e2e:affected` after its own, stamp-checked build) only starts the server. */
const BUILD = process.env.E2E_SKIP_BUILD === '1' ? '' : 'pnpm build && pnpm check:no-dev-panel && ';

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: false,
  workers: 1,
  // Pages query a remote Neon DB (hundreds of ms per round trip); the 5c-2 pages make several each.
  timeout: 90_000,
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
