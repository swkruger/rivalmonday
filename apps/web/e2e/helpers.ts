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

/**
 * The magic link from the first email to `email` that was not in `before` (waits up to 10 s for it to land).
 * `to` is a string in the file transport's JSON; an array is accepted too in case that ever changes.
 */
export async function newMagicLink(before: Set<string>, email: string): Promise<string> {
  for (let i = 0; i < 40; i++) {
    for (const f of (await outboxFiles()).filter((name) => !before.has(name))) {
      try {
        const msg = JSON.parse(await readFile(join(OUTBOX, f), 'utf8')) as { to: string | string[]; text: string };
        const to = (Array.isArray(msg.to) ? msg.to : [msg.to]).map((a) => a.toLowerCase());
        if (!to.includes(email.toLowerCase())) continue;
        const m = /https?:\/\/\S+magic-link\/verify\S+/.exec(msg.text);
        if (m) return m[0];
      } catch {
        // Still being written; try again on the next tick.
      }
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`no new magic link to ${email} in the outbox ${OUTBOX} within 10 s`);
}

/** How long a rate-limited magic-link request is retried (the limit window is 60 s). */
const RATE_LIMIT_BUDGET_MS = 90_000;
const RATE_LIMIT_POLL_MS = 5_000;

/**
 * Request a magic link from the sign-in form already open in `page` and return it. Magic links are rate-limited per IP
 * across the whole run; only that signal (HTTP 429 from the magic-link endpoint) is retried, polling until the window
 * clears; any other failure fails at once.
 */
export async function requestMagicLink(page: Page, email: string): Promise<string> {
  const deadline = Date.now() + RATE_LIMIT_BUDGET_MS;
  for (;;) {
    const before = await outboxSnapshot();
    await page.getByLabel(/email/i).fill(email);
    const response = page.waitForResponse((r) => r.request().method() === 'POST' && r.url().includes('/sign-in/magic-link'));
    await page.getByRole('button', { name: /email me a sign-in link/i }).click();
    if ((await response).status() !== 429) {
      await expect(page).toHaveURL(/check-email/);
      return newMagicLink(before, email);
    }
    if (Date.now() > deadline) throw new Error(`magic-link rate limit for ${email} did not clear within ${RATE_LIMIT_BUDGET_MS / 1000} s`);
    await page.waitForTimeout(RATE_LIMIT_POLL_MS);
  }
}

export async function signIn(page: Page, email: string, next = '/agency'): Promise<void> {
  await page.goto(`/sign-in?next=${encodeURIComponent(next)}`);
  await page.goto(await requestMagicLink(page, email));
}
