import { expect, test } from '@playwright/test';
import { createDb } from '@cs/db';
import { sql } from 'drizzle-orm';
import { ADMIN_STATE, ensureAdminState } from './admin-session';

/**
 * brief-report on seeded data (no worker runs in E2E): the sent brief of "E2E HVAC" carries a graded change list over the
 * seeded price-change event. The page shows it under the written items, Minor folded; opening Minor shows its line.
 */
test.beforeAll(async ({ browser }, testInfo) => {
  await ensureAdminState(browser, testInfo);
});

test.use({ storageState: ADMIN_STATE });

async function sentBrief(): Promise<{ clientId: string; briefId: string }> {
  const { db, close } = createDb(process.env.TEST_DATABASE_URL!);
  try {
    const rows = [
      ...(await db.execute<{ client_id: string; id: string }>(
        sql`select b.client_id, b.id from brief b join client c on c.id = b.client_id where c.name = 'E2E HVAC' and b.status = 'sent' and b.report is not null limit 1`,
      )),
    ];
    return { clientId: rows[0]!.client_id, briefId: rows[0]!.id };
  } finally {
    await close();
  }
}

test('client sees graded changes and opens Minor', { tag: ['@briefs'] }, async ({ page }) => {
  const { clientId, briefId } = await sentBrief();
  await page.goto(`/c/${clientId}/briefs/${briefId}`);
  await expect(page.getByRole('heading', { level: 2, name: 'Other changes this week' })).toBeVisible();
  await expect(page.getByText('Smith HVAC cut its AC tune-up to $79 (graded notable).')).toBeVisible();
  const minor = page.getByText(/^Minor \(1\)$/);
  await expect(minor).toBeVisible();
  await expect(page.getByText('Smith HVAC touched its pricing page (graded minor).')).toBeHidden();
  await minor.click();
  await expect(page.getByText('Smith HVAC touched its pricing page (graded minor).')).toBeVisible();
});
