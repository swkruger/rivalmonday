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
export const E2E_LINK_SECRET = 'e2e-link-secret-'.repeat(3);

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: false,
  workers: 1,
  use: { baseURL: `http://localhost:${PORT}` },
  webServer: {
    command: `pnpm build && pnpm start --port ${PORT}`,
    url: `http://localhost:${PORT}/health`,
    timeout: 300_000,
    reuseExistingServer: false,
    env: {
      APP_URL: `http://localhost:${PORT}`,
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
      EVIDENCE_FS_DIR: fileURLToPath(new URL('./test-results/evidence', import.meta.url)),
    },
  },
});
