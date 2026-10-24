import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// via helpers (the `@cs/db/test-helpers` entry) — also proves the helpers <-> isolation-world import cycle loads
import { IDS, type IsolationWorld, TABLE_CLASS, type TableClass, type TenantKey, openTestDbs, seedIsolationWorld, truncateAll, worldId } from '../test/helpers';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());

const TENANTS: TenantKey[] = ['A', 'A1', 'A2', 'B', 'B1', 'X', 'Y', 'Z'];
const REQUIRED: Partial<Record<TableClass, TenantKey[]>> = {
  tenant_client: ['A1', 'A2', 'B1'],
  tenant_agency: ['A', 'B'],
  global_public: ['Y', 'Z'],
};
/** Rows with no free-text column to tag (pure keys, check-constrained enums/slugs, numbers or typed JSON). */
const NO_FREE_TEXT = new Set([
  'client_competitor', 'event_change', 'move_event', 'alert_event', 'event_score', 'agency_daily_stat', 'review_analysis', 'competitor_signal', 'notification_pref',
  'agency_onboarding', 'intake_link', 'runbook',
]);

const rowsMatching = async (table: string, pk: Record<string, unknown>) => {
  const r = (await dbs.owner.execute(sql`SELECT count(*)::int AS n FROM ${sql.identifier(table)} t WHERE to_jsonb(t) @> ${JSON.stringify(pk)}::jsonb`)) as unknown as { n: number }[];
  return r[0]!.n;
};
const rowText = async (table: string, pk: Record<string, unknown>) => {
  const r = (await dbs.owner.execute(sql`SELECT to_jsonb(t)::text AS j FROM ${sql.identifier(table)} t WHERE to_jsonb(t) @> ${JSON.stringify(pk)}::jsonb`)) as unknown as { j: string }[];
  return r[0]?.j ?? '';
};

let w: IsolationWorld;
beforeAll(async () => {
  await truncateAll(dbs.owner);
  w = await seedIsolationWorld(dbs.owner);
});

describe('isolation world', () => {
  it('every public table has a TABLE_CLASS entry and no stale entries', async () => {
    const r = (await dbs.owner.execute(sql`SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY 1`)) as unknown as { tablename: string }[];
    expect(Object.keys(TABLE_CLASS).sort()).toEqual(r.map((x) => x.tablename).sort());
  });

  it('every tenant table has a row for each of its tenants', async () => {
    const missing: string[] = [];
    for (const [table, cls] of Object.entries(TABLE_CLASS)) {
      for (const tenant of REQUIRED[cls] ?? []) {
        if (!(w.rows[table]?.[tenant]?.length)) missing.push(`${table}/${tenant}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('service_only tables with agency_id/client_id have rows on the A side and the B side', async () => {
    const r = (await dbs.owner.execute(sql`
      SELECT DISTINCT table_name AS t FROM information_schema.columns
      WHERE table_schema = 'public' AND column_name IN ('agency_id', 'client_id') ORDER BY 1`)) as unknown as { t: string }[];
    const tenantBearing = r.map((x) => x.t).filter((t) => TABLE_CLASS[t] === 'service_only');
    expect(tenantBearing.length).toBeGreaterThan(15);
    const missing: string[] = [];
    for (const t of tenantBearing) {
      const has = (keys: TenantKey[]) => keys.some((k) => (w.rows[t]?.[k]?.length ?? 0) > 0);
      if (!has(['A', 'A1', 'A2'])) missing.push(`${t}/A`);
      if (!has(['B', 'B1'])) missing.push(`${t}/B`);
    }
    expect(missing).toEqual([]);
  });

  it('every recorded pk matches exactly one seeded row', async () => {
    const bad: string[] = [];
    for (const [table, byTenant] of Object.entries(w.rows)) {
      expect(TABLE_CLASS[table], table).toBeDefined();
      for (const [tenant, pks] of Object.entries(byTenant)) {
        for (const pk of pks ?? []) {
          const n = await rowsMatching(table, pk);
          if (n !== 1) bad.push(`${table}/${tenant} ${JSON.stringify(pk)} -> ${n}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it("every seeded row with free text carries its tenant's canary", async () => {
    const bad: string[] = [];
    for (const [table, byTenant] of Object.entries(w.rows)) {
      if (NO_FREE_TEXT.has(table)) continue;
      for (const [tenant, pks] of Object.entries(byTenant)) {
        for (const pk of pks ?? []) {
          if (!(await rowText(table, pk)).includes(`CANARY-${tenant}-`)) bad.push(`${table}/${tenant}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it('canaries are unique per tenant', () => {
    const seen = new Map<string, TenantKey>();
    for (const t of TENANTS) {
      const list = w.canaries(t);
      expect(list.length, t).toBeGreaterThan(0);
      expect(new Set(list).size, t).toBe(list.length);
      for (const c of list) {
        expect(c.startsWith(`CANARY-${t}-`), c).toBe(true);
        expect(seen.get(c), c).toBeUndefined();
        seen.set(c, t);
      }
    }
    // no canary is a substring of another tenant's canary (findForeign matches substrings)
    for (const [c, t] of seen) for (const [d, u] of seen) if (t !== u) expect(d.includes(c), `${c} in ${d}`).toBe(false);
  });

  it('idsOf lists uuid pks per tenant, disjoint across tenants', () => {
    const owner = new Map<string, TenantKey>();
    for (const t of TENANTS) {
      for (const id of w.idsOf(t)) {
        expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
        expect(owner.get(id), id).toBeUndefined();
        owner.set(id, t);
      }
    }
    expect(w.idsOf('A')).toContain(IDS.agencyA);
    expect(w.idsOf('A1')).toContain(IDS.clientA1);
    expect(w.idsOf('Z')).toContain(w.ids.competitorZ);
    expect(w.idsOf('B1')).toContain(worldId('brief', 'B1', 1));
  });

  it('users, contexts and forbidden tenants follow Decision 6', async () => {
    expect(w.ctx('amA').clientScope).toEqual([IDS.clientA1]);
    expect(w.ctx('ownerA2')).toMatchObject({ agencyId: IDS.agencyA, role: 'client_owner', clientScope: [IDS.clientA2] });
    expect(w.ctx('viewerA1').role).toBe('client_viewer');
    expect(w.ctx('adminB')).toMatchObject({ agencyId: IDS.agencyB, role: 'agency_admin', clientScope: 'all' });
    expect([...w.ctx('ownerA1').features].sort()).toEqual(['alert_rules', 'ask', 'dashboard', 'manage_competitors', 'mcp']);
    expect([...w.ctx('ownerA1').planFeatures].sort()).toEqual(['ask', 'mcp']);
    expect(w.operatorCtx()).toMatchObject({ agencyId: IDS.agencyA, role: 'agency_admin', userId: w.users.operator.userId });
    expect(w.forbidden('adminB')).toEqual(expect.arrayContaining(['A', 'A1', 'A2', 'Y']));
    expect(w.forbidden('adminB')).not.toContain('X');
    expect(w.forbidden('ownerA2')).toEqual(expect.arrayContaining(['A1', 'X', 'B', 'B1', 'Z']));
    expect(w.forbidden('amA')).toEqual(expect.arrayContaining(['A2', 'Y', 'B', 'B1', 'Z']));
    expect(w.forbidden('ownerA1')).not.toContain('A');
    const m = (await dbs.owner.execute(sql`SELECT user_id, role, client_id FROM membership ORDER BY user_id`)) as unknown as { user_id: string }[];
    expect(m.map((x) => x.user_id)).toEqual(expect.arrayContaining(Object.values(w.users).map((u) => u.userId)));
    const pa = (await dbs.owner.execute(sql`SELECT role FROM platform_admin WHERE user_id = ${w.users.operator.userId} AND revoked_at IS NULL`)) as unknown as { role: string }[];
    expect(pa.map((x) => x.role)).toEqual(['owner']);
  });

  it('evidence objects are exposed as text for a memory store', async () => {
    const r = (await dbs.owner.execute(sql`SELECT object_key FROM evidence ORDER BY 1`)) as unknown as { object_key: string }[];
    expect(r.length).toBeGreaterThan(0);
    for (const { object_key } of r) expect(w.evidenceText.get(object_key)).toMatch(/CANARY-[XYZ]-/);
  });

  it('world is deterministic', async () => {
    const first = { rows: w.rows, canaries: TENANTS.map((t) => w.canaries(t)), ev: [...w.evidenceText] };
    await truncateAll(dbs.owner);
    w = await seedIsolationWorld(dbs.owner);
    expect({ rows: w.rows, canaries: TENANTS.map((t) => w.canaries(t)), ev: [...w.evidenceText] }).toEqual(first);
  });
});

describe('worldId', () => {
  it('is a stable v4-layout uuid per (table, tenant, n)', () => {
    expect(worldId('brief', 'A1', 1)).toBe(worldId('brief', 'A1', 1));
    expect(worldId('brief', 'A1', 1)).not.toBe(worldId('brief', 'A1', 2));
    expect(worldId('brief', 'A1', 1)).not.toBe(worldId('brief', 'A2', 1));
    expect(worldId('alert', 'B1', 3)).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});
