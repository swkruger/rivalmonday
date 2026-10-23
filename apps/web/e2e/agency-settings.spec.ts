import { expect, type Page, test } from '@playwright/test';
import { ADMIN_STATE, ensureAdminState } from './admin-session';

/**
 * 15c-2a T10: Slack & Teams webhooks. The server runs with WEBHOOK_FAKE_SEND=1 (playwright.config.ts), so "Send test"
 * posts to an in-process fake receiver: hooks.slack.com answers 200; nothing leaves the machine.
 */
test.use({ storageState: ADMIN_STATE });

async function addWebhook(page: Page, kind: 'slack' | 'teams', url: string): Promise<void> {
  await page.goto('/agency/settings/slack-teams');
  await page.getByLabel('Kind', { exact: true }).selectOption(kind);
  await page.getByRole('textbox', { name: 'Webhook URL', exact: true }).fill(url);
  await page.getByRole('button', { name: 'Add webhook' }).click();
  await expect(page.getByText('Webhook added.')).toBeVisible();
}

test.describe.serial('agency settings: Slack & Teams', () => {
  test.beforeAll(async ({ browser }, testInfo) => {
    await ensureAdminState(browser, testInfo);
  });

  test('send test shows Slack answered 200', { tag: ['@settings'] }, async ({ page }) => {
    await addWebhook(page, 'slack', `https://hooks.slack.com/services/T0/B0/e2e-${Date.now()}`);
    const row = page.getByRole('row').filter({ hasText: 'hooks.slack.com' }).last();
    await expect(row.getByText('Slack', { exact: true })).toBeVisible();
    await expect(row.getByText('All agency notices')).toBeVisible();
    await row.getByRole('button', { name: 'Send test' }).click();
    await expect(row.getByRole('status')).toHaveText('Test sent — Slack answered 200.');
  });

  test('delete asks for confirmation', { tag: ['@settings'] }, async ({ page }) => {
    const host = `e2e-${Date.now()}.webhook.office.com`;
    await addWebhook(page, 'teams', `https://${host}/webhookb2/abc`);
    const row = page.getByRole('row').filter({ hasText: host });
    await row.getByRole('button', { name: 'Delete' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Delete this webhook?')).toBeVisible();
    await expect(dialog.getByText('Briefs and alerts stop going to this Teams channel. You can add it again later.')).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toBeHidden();
    await expect(row).toBeVisible();
    await row.getByRole('button', { name: 'Delete' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByRole('row').filter({ hasText: host })).toHaveCount(0);
  });
});
