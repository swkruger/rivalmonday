import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, type Browser, type TestInfo } from '@playwright/test';
import { signIn } from './helpers';

/** One sign-in per run, reused as storage state (HANDOVER §6 magic-link rate limit). */
export const ADMIN_STATE = fileURLToPath(new URL('../test-results/admin-state.json', import.meta.url));

/** For `test.beforeAll`: signs in as the seeded admin unless an earlier spec already saved a session. */
export async function ensureAdminState(browser: Browser, testInfo: TestInfo): Promise<void> {
  if (existsSync(ADMIN_STATE)) return;
  const context = await browser.newContext({ baseURL: testInfo.project.use.baseURL, storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  await signIn(page, 'admin@e2e.test');
  await expect(page).toHaveURL(/\/agency$/);
  await context.storageState({ path: ADMIN_STATE });
  await context.close();
}
