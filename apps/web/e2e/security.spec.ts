import { readFileSync } from 'node:fs';
import { createDb } from '@cs/db';
import { expect, test } from '@playwright/test';
import { sql } from 'drizzle-orm';
import { ASK_FIXTURE_FILE } from '../playwright.config';
import { ADMIN_STATE, ensureAdminState } from './admin-session';
import type { AskFixture } from './seed';

/**
 * Phase 7a2 user-visible refusals: the Ask turn route's Origin gate, an archived client (= deleted) and a plan without
 * Ask. Each mutates E2E data through the service DB and restores it in a `finally`; the suite runs with one worker.
 * (The support-session evidence audit row is in support.spec.ts.)
 */
const fx = (): AskFixture => JSON.parse(readFileSync(ASK_FIXTURE_FILE, 'utf8')) as AskFixture;

async function withDb<T>(fn: (db: ReturnType<typeof createDb>['db']) => Promise<T>): Promise<T> {
  const { db, close } = createDb(process.env.TEST_DATABASE_URL!);
  try {
    return await fn(db);
  } finally {
    await close();
  }
}
const rows = async <T extends Record<string, unknown>>(q: ReturnType<typeof sql>) => withDb(async (db) => [...(await db.execute<T>(q))]);

test.describe('as the agency admin', () => {
  test.beforeAll(async ({ browser }, testInfo) => ensureAdminState(browser, testInfo));
  test.use({ storageState: ADMIN_STATE });

  test('Ask POST without Origin is 404 (a same-origin POST passes the gate)', { tag: ['@ask'] }, async ({ request, baseURL }) => {
    const { toggleCo } = fx();
    const body = JSON.stringify({ clientId: toggleCo.id, text: 'hello' });
    const noOrigin = await request.post('/api/ask/turn', { data: body, headers: { 'content-type': 'application/json' } });
    expect(noOrigin.status()).toBe(404);
    const foreign = await request.post('/api/ask/turn', { data: body, headers: { 'content-type': 'application/json', origin: 'https://evil.example' } });
    expect(foreign.status()).toBe(404);
    // With the right Origin the request gets past the gate: a non-JSON body is then a 415 (never a 404).
    const sameOrigin = await request.post('/api/ask/turn', { data: 'x', headers: { 'content-type': 'text/plain', origin: new URL(baseURL!).origin } });
    expect(sameOrigin.status()).toBe(415);
  });

  test('an archived client page 404s for its agency admin', { tag: ['@platform'] }, async ({ page }) => {
    const { toggleCo } = fx();
    const [{ id }] = await rows<{ id: string }>(sql`
      insert into client (agency_id, vertical_id, name, features, keywords, service_area)
      select agency_id, vertical_id, 'Archive Probe Co', features, keywords, service_area from client where id = ${toggleCo.id}
      returning id`) as [{ id: string }];
    try {
      expect((await page.goto(`/c/${id}`))?.status()).toBe(200);
      await withDb((db) => db.execute(sql`update client set archived_at = now() where id = ${id}`));
      expect((await page.goto(`/c/${id}`))?.status()).toBe(404);
      expect((await page.goto(`/c/${id}/ask`))?.status()).toBe(404);
      await withDb((db) => db.execute(sql`update client set archived_at = null where id = ${id}`));
      expect((await page.goto(`/c/${id}`))?.status()).toBe(200);
    } finally {
      await withDb((db) => db.execute(sql`delete from client where id = ${id}`));
    }
  });

  test('a plan without Ask hides the Ask page', { tag: ['@ask'] }, async ({ page }) => {
    const { toggleCo } = fx();
    const [{ agency_id }] = await rows<{ agency_id: string }>(sql`select agency_id from client where id = ${toggleCo.id}`) as [{ agency_id: string }];
    const [old] = await rows<{ state: string; plan_id: string | null }>(sql`select state, plan_id from agency_billing where agency_id = ${agency_id}`);
    const [{ id: planId }] = await rows<{ id: string }>(sql`
      insert into plan (code, version, name, base_price_cents, included_seats, seat_price_cents, trial_days, features, created_by)
      values ('e2e_no_ask', 1, 'E2E no Ask', 0, 3, 0, 0, '["mcp"]'::jsonb, 'e2e') returning id`) as [{ id: string }];
    try {
      await withDb((db) => db.execute(sql`
        insert into agency_billing (agency_id, state, plan_id) values (${agency_id}, 'active', ${planId})
        on conflict (agency_id) do update set state = 'active', plan_id = ${planId}`));
      expect((await page.goto(`/c/${toggleCo.id}/ask`))?.status()).toBe(404);
      expect((await page.goto(`/c/${toggleCo.id}`))?.status()).toBe(200);
    } finally {
      await withDb(async (db) => {
        if (old) await db.execute(sql`update agency_billing set state = ${old.state}, plan_id = ${old.plan_id} where agency_id = ${agency_id}`);
        else await db.execute(sql`delete from agency_billing where agency_id = ${agency_id}`);
        await db.execute(sql`delete from plan where id = ${planId}`);
      });
    }
    expect((await page.goto(`/c/${toggleCo.id}/ask`))?.status()).toBe(200);
  });
});
