import { createDb } from '@cs/db';
import { bandColor, resolveBranding } from '@cs/email/branding';
import { expect, test } from '@playwright/test';
import { sql } from 'drizzle-orm';
import { ADMIN_STATE, ensureAdminState } from './admin-session';

/**
 * 13a3a: the client page's title band takes the agency's band colour (`bandColor`: its own header colour when it passes the
 * floor, else the deep shade of its brand colours), in four themes at desktop and phone width; full-page screenshots are
 * attached for the owner. Branding is written straight to the DB and restored afterwards.
 */
test.use({ storageState: ADMIN_STATE });

type Stored = Record<string, string>;
const AGENCY = 'E2E Agency';
const THEMES: { name: string; patch: Stored; fixed?: string }[] = [
  { name: 'default', patch: {} },
  { name: 'teal', patch: { secondary: '#0F766E' } },
  { name: 'yellow', patch: { secondary: '#FFD400' } },
  // #5c2baf passes the band floor, so the band must be exactly it (hard-coded, not derived from the code under test)
  { name: 'override', patch: { headerColor: '#5c2baf' }, fixed: 'rgb(92, 43, 175)' },
];
const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'phone', width: 390, height: 844 },
] as const;

const rgb = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
};

async function withDb<T>(fn: (db: ReturnType<typeof createDb>['db']) => Promise<T>): Promise<T> {
  const { db, close } = createDb(process.env.TEST_DATABASE_URL!);
  try {
    return await fn(db);
  } finally {
    await close();
  }
}

let original: Stored | null = null;
let clientId = '';
let loaded = false;

test.describe.serial('branding themes: client title band', () => {
  test.beforeAll(async ({ browser }, testInfo) => {
    await ensureAdminState(browser, testInfo);
    await withDb(async (db) => {
      const rows = [...(await db.execute<{ branding: Stored | null; client_id: string }>(
        sql`select a.branding, c.id as client_id from agency a join client c on c.agency_id = a.id where a.name = ${AGENCY} and c.name = 'E2E HVAC'`,
      ))];
      original = rows[0]!.branding;
      clientId = rows[0]!.client_id;
      loaded = true;
    });
  });

  test.afterAll(async () => {
    if (!loaded) return;
    await withDb((db) => db.execute(sql`update agency set branding = ${original === null ? null : JSON.stringify(original)}::jsonb where name = ${AGENCY}`));
  });

  for (const theme of THEMES) {
    test(`title band follows the ${theme.name} theme`, { tag: ['@whitelabel'] }, async ({ page }, testInfo) => {
      const stored = { ...(original ?? {}), ...theme.patch };
      await withDb((db) => db.execute(sql`update agency set branding = ${JSON.stringify(stored)}::jsonb where name = ${AGENCY}`));
      const expected = theme.fixed ?? rgb(bandColor(resolveBranding(AGENCY, stored)));
      for (const vp of VIEWPORTS) {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        const res = await page.goto(`/c/${clientId}`);
        expect(res?.status()).toBe(200);
        const band = page.locator('.rm-ink-band').first();
        await expect(band).toBeVisible();
        await expect.poll(() => band.evaluate((el) => getComputedStyle(el).backgroundColor), `${theme.name} ${vp.name}`).toBe(expected);
        await testInfo.attach(`${theme.name}-${vp.name}`, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
      }
    });
  }
});
