import { sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { errorText, openTestDbs, truncateAll } from '../test/helpers';
import { runbook, runbookItem } from './schema';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
beforeEach(async () => {
  await truncateAll(dbs.owner);
});

async function seedAgencyClient() {
  const a = (await dbs.owner.execute(sql`insert into agency (name) values ('A') returning id`))[0] as { id: string };
  const b = (await dbs.owner.execute(sql`insert into agency (name) values ('B') returning id`))[0] as { id: string };
  const c = (await dbs.owner.execute(sql`insert into client (agency_id, name, vertical_id) values (${a.id}, 'C', 'generic') returning id`))[0] as { id: string };
  return { a: a.id, b: b.id, c: c.id };
}

describe('runbook tables', () => {
  it('app_user is denied on both tables', async () => {
    for (const t of [runbook, runbookItem]) {
      expect(await errorText(dbs.app.select().from(t))).toMatch(/permission denied/);
    }
  });

  it('allows exactly one platform runbook', async () => {
    await dbs.owner.execute(sql`insert into runbook (level) values ('platform')`);
    expect(await errorText(dbs.owner.execute(sql`insert into runbook (level) values ('platform')`))).toMatch(/runbook_platform_uq|duplicate/);
  });

  it('level/owner CHECK rejects mixed rows', async () => {
    const { a, c } = await seedAgencyClient();
    const bad = [
      sql`insert into runbook (level, agency_id) values ('platform', ${a})`,
      sql`insert into runbook (level) values ('agency')`,
      sql`insert into runbook (level, agency_id, client_id) values ('agency', ${a}, ${c})`,
      sql`insert into runbook (level, agency_id) values ('client', ${a})`,
      sql`insert into runbook (level, tailor_status) values ('platform', 'bogus')`,
    ];
    for (const q of bad) expect(await errorText(dbs.owner.execute(q))).toMatch(/check constraint/i);
  });

  it('one agency runbook and one client runbook; client must belong to the agency', async () => {
    const { a, b, c } = await seedAgencyClient();
    await dbs.owner.execute(sql`insert into runbook (level, agency_id) values ('agency', ${a})`);
    expect(await errorText(dbs.owner.execute(sql`insert into runbook (level, agency_id) values ('agency', ${a})`))).toMatch(/runbook_agency_uq|duplicate/);
    await dbs.owner.execute(sql`insert into runbook (level, agency_id, client_id) values ('client', ${a}, ${c})`);
    expect(await errorText(dbs.owner.execute(sql`insert into runbook (level, agency_id, client_id) values ('client', ${a}, ${c})`))).toMatch(/runbook_client_uq|duplicate/);
    const c2 = (await dbs.owner.execute(sql`insert into client (agency_id, name, vertical_id) values (${a}, 'C2', 'generic') returning id`))[0] as { id: string };
    expect(await errorText(dbs.owner.execute(sql`insert into runbook (level, agency_id, client_id) values ('client', ${b}, ${c2.id})`))).toMatch(/foreign key/i);
  });

  it('runbook_item key/kind CHECKs hold and rows cascade with the runbook', async () => {
    const rb = (await dbs.owner.execute(sql`insert into runbook (level) values ('platform') returning id`))[0] as { id: string };
    const ins = (key: string, kind: string) =>
      dbs.owner.execute(sql`insert into runbook_item (runbook_id, item_key, kind, content, updated_by) values (${rb.id}, ${key}, ${kind}, '{}'::jsonb, 'system')`);
    await ins('play:price_drop', 'play');
    expect(await errorText(ins('play:Bad-Key', 'play'))).toMatch(/check constraint/i);
    expect(await errorText(ins('thing:x', 'play'))).toMatch(/check constraint/i);
    expect(await errorText(ins('knob:x', 'play'))).toMatch(/check constraint/i);
    expect(await errorText(ins('play:price_drop', 'play'))).toMatch(/duplicate|pkey/);
    await dbs.owner.execute(sql`delete from runbook where id = ${rb.id}`);
    const n = (await dbs.owner.execute(sql`select count(*)::int n from runbook_item`))[0] as { n: number };
    expect(n.n).toBe(0);
  });

  it('brief_item and recommendation carry playbook_version', async () => {
    const r = (await dbs.owner.execute(sql`select table_name from information_schema.columns where column_name = 'playbook_version' and table_name in ('brief_item','recommendation')`));
    expect(r).toHaveLength(2);
  });
});
