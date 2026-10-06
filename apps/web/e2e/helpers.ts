import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, type Page } from '@playwright/test';
import { OUTBOX } from '../playwright.config';

async function outboxFiles(): Promise<string[]> {
  return (await readdir(OUTBOX).catch(() => [] as string[])).filter((f) => f.endsWith('.json')).sort();
}

/**
 * Snapshot the outbox *before* asking for a link, then hand the snapshot to `newMagicLink`. `sendMagicLink` sends
 * in the background (decision 2), so the new email can land after the "check your email" page shows.
 *
 * Fix round 1: this replaces a module-level "last file I returned" watermark. Playwright restarts the worker process
 * after any failed test, which reset that watermark to '' — the next test then took the newest file already in the
 * outbox (the previous test's consumed link) before its own email landed, and Better Auth answered INVALID_TOKEN
 * ("That sign-in link expired or was already used"). A snapshot taken by the caller survives worker restarts.
 */
export async function outboxSnapshot(): Promise<Set<string>> {
  return new Set(await outboxFiles());
}

/** The magic link from the first email that was not in `before` (waits up to 10 s for it to land). */
export async function newMagicLink(before: Set<string>): Promise<string> {
  for (let i = 0; i < 40; i++) {
    for (const f of (await outboxFiles()).filter((name) => !before.has(name))) {
      try {
        const msg = JSON.parse(await readFile(join(OUTBOX, f), 'utf8')) as { text: string };
        const m = /https?:\/\/\S+magic-link\/verify\S+/.exec(msg.text);
        if (m) return m[0];
      } catch {
        // Still being written; try again on the next tick.
      }
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('no new magic link in the outbox');
}

/** Request a magic link from the sign-in form already open in `page` and return it. */
export async function requestMagicLink(page: Page, email: string): Promise<string> {
  const before = await outboxSnapshot();
  await page.getByLabel(/email/i).fill(email);
  await page.getByRole('button', { name: /email me a sign-in link/i }).click();
  await expect(page).toHaveURL(/check-email/);
  return newMagicLink(before);
}

export async function signIn(page: Page, email: string, next = '/agency'): Promise<void> {
  await page.goto(`/sign-in?next=${encodeURIComponent(next)}`);
  await page.goto(await requestMagicLink(page, email));
}
