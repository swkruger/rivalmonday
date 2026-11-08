import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { IDS, errorText, openTestDbs, seedTenancy, truncateAll } from '../test/helpers';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());

const BLOCKS = readFileSync(join(__dirname, '../migrations/0102_web_readiness.sql'), 'utf8').split('--> statement-breakpoint');
const BACKFILL_STMT = BLOCKS.find((b) => b.includes("SET inactive_reason = 'manual'"))!;

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
});

async function insertPage(url: string, active: boolean, reason: string | null) {
  await dbs.owner.execute(sql`INSERT INTO tracked_page (competitor_id, url, page_type, source, cadence, active, inactive_reason)
    VALUES (${IDS.competitorX}, ${url}, 'pricing', 'nav', 'daily', ${active}, ${reason})`);
}

describe('migration 0102 web readiness', () => {
  it('tracked_page rejects active=false without a reason and active=true with one', async () => {
    expect(await errorText(insertPage('https://w.example/a', false, null))).toMatch(/tracked_page_inactive_reason_check/);
    expect(await errorText(insertPage('https://w.example/b', true, 'gone'))).toMatch(/tracked_page_inactive_reason_check/);
    expect(await errorText(insertPage('https://w.example/c', false, 'bogus'))).toMatch(/tracked_page_inactive_reason_check/);
    await insertPage('https://w.example/d', true, null);
    await insertPage('https://w.example/e', false, 'gone');
  });

  it('existing inactive rows become manual', async () => {
    await dbs.owner.execute(sql`ALTER TABLE tracked_page DROP CONSTRAINT tracked_page_inactive_reason_check`);
    try {
      await dbs.owner.execute(sql`INSERT INTO tracked_page (competitor_id, url, page_type, source, cadence, active)
        VALUES (${IDS.competitorX}, 'https://w.example/old', 'pricing', 'nav', 'daily', false)`);
      await dbs.owner.execute(sql.raw(BACKFILL_STMT));
      const rows = (await dbs.owner.execute(sql`SELECT inactive_reason FROM tracked_page WHERE url = 'https://w.example/old'`)) as unknown as { inactive_reason: string }[];
      expect(rows[0]!.inactive_reason).toBe('manual');
    } finally {
      await dbs.owner.execute(sql`ALTER TABLE tracked_page ADD CONSTRAINT tracked_page_inactive_reason_check CHECK (
        (active AND inactive_reason IS NULL) OR (NOT active AND inactive_reason IS NOT NULL AND inactive_reason IN ('gone', 'duplicate', 'replaced', 'manual')))`);
    }
  });

  it('site_url and site_discovery are service-role only', async () => {
    await dbs.service.execute(sql`INSERT INTO site_url (competitor_id, url_key, url, source) VALUES (${IDS.competitorX}, 'a', 'https://w.example/a', 'sitemap')`);
    await dbs.service.execute(sql`INSERT INTO site_discovery (competitor_id) VALUES (${IDS.competitorX})`);
    expect(await errorText(dbs.service.execute(sql`INSERT INTO site_url (competitor_id, url_key, url, source) VALUES (${IDS.competitorX}, 'b', 'u', 'other')`))).toMatch(/site_url_source_check/);
    expect(await errorText(dbs.app.execute(sql`SELECT 1 FROM site_url`))).toMatch(/permission denied/);
    expect(await errorText(dbs.app.execute(sql`SELECT 1 FROM site_discovery`))).toMatch(/permission denied/);
  });
});
