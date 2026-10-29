import { defineConfig } from '@playwright/test';

const PORT = Number(process.env.SITE_E2E_PORT ?? 3200);
/** https on purpose: the CSP's `upgrade-insecure-requests` would upgrade an http fetch past the route mock. */
export const MOCK_APP_URL = 'https://app.e2e.test';

/** `E2E_SKIP_BUILD=1` only starts the server (after a build you already made with the same env). */
const BUILD = process.env.E2E_SKIP_BUILD === '1' ? '' : 'pnpm build && ';

const SERVER_ENV = {
  NEXT_PUBLIC_APP_URL: MOCK_APP_URL,
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: '',
  // Blank: no `<Analytics />`, and a non-production build (robots disallows everything).
  VERCEL_ENV: '',
};

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  use: { baseURL: `http://localhost:${PORT}` },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 900 } } },
    { name: 'phone', use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
  webServer: {
    command: `${BUILD}pnpm start --port ${PORT}`,
    url: `http://localhost:${PORT}/`,
    timeout: 300_000,
    reuseExistingServer: false,
    env: SERVER_ENV,
  },
});
