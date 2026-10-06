import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, type Page } from '@playwright/test';
import { OUTBOX } from '../playwright.config';

/**
 * Filenames are `<ISO timestamp>-<id>.json` (`createFileTransport`), so they sort chronologically. `sendMagicLink`
 * dispatches the actual send via `runInBackground` (decision 2: same response whether or not the address may sign
 * in), so the file for a just-requested link can still be mid-write when this is called. Tracking the last filename
 * this helper itself returned — rather than just "any file exists" — stops a second sign-in in the same run from
 * grabbing an earlier call's still-unconsumed link before its own new one lands.
 */
let lastSeenFile = '';

export async function latestMagicLink(): Promise<string> {
  for (let i = 0; i < 40; i++) {
    const files = (await readdir(OUTBOX).catch(() => [] as string[])).filter((f) => f.endsWith('.json')).sort();
    const latest = files.at(-1);
    if (latest && latest > lastSeenFile) {
      const msg = JSON.parse(await readFile(join(OUTBOX, latest), 'utf8')) as { text: string };
      const m = /https?:\/\/\S+magic-link\/verify\S+/.exec(msg.text);
      if (m) {
        lastSeenFile = latest;
        return m[0];
      }
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('no magic link in the outbox');
}

export async function signIn(page: Page, email: string, next = '/agency'): Promise<void> {
  await page.goto(`/sign-in?next=${encodeURIComponent(next)}`);
  await page.getByLabel(/email/i).fill(email);
  await page.getByRole('button', { name: /email me a sign-in link/i }).click();
  await expect(page).toHaveURL(/check-email/);
  await page.goto(await latestMagicLink());
}
