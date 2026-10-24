/**
 * Phase 7c1 Task 2: the RLS sweep — a generic, class-driven proof of row-level security over EVERY public table as
 * `app_user`, on the isolation world (`TABLE_CLASS` says which rules a table must satisfy). A refusal only counts when
 * the error is `row-level security` / `permission denied` (no wrong-reason refusals), and no check passes vacuously:
 * the owner connection must see the rows we expect `app_user` NOT to see.
 */
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type TenantScope, withTenant } from './tenant';
import { IDS, type IsolationWorld, TABLE_CLASS, type TableClass, type TenantKey, errorText, openTestDbs, seedIsolationWorld, truncateAll } from '../test/helpers';

const dbs = openTestDbs();
afterAll(async () => {
  await dbs.owner.execute(sql`DROP SCHEMA IF EXISTS cs_sweep_probe CASCADE`);
  await dbs.closeAll();
});

type Pk = Record<string, unknown>;
const REFUSED = /row-level security|permission denied/i;

const scopeA: TenantScope = { agencyId: IDS.agencyA, clientScope: 'all' };
const scopeB: TenantScope = { agencyId: IDS.agencyB, clientScope: 'all' };
const scopeA1: TenantScope = { agencyId: IDS.agencyA, clientScope: [IDS.clientA1] };

/** `public.t` or a schema-qualified `schema.t` (the probe lives outside public). */
const qual = (t: string) => {
  const i = t.indexOf('.');
  return i < 0 ? sql.identifier(t) : sql`${sql.identifier(t.slice(0, i))}.${sql.identifier(t.slice(i + 1))}`;
};
const regclassOf = (t: string) => (t.includes('.') ? t : `public.${t}`);
const rowsOf = (r: unknown) => r as unknown as Record<string, any>[];

const errText = (e: unknown) => {
  const err = e as { message?: string; cause?: { message?: string } };
  return `${err.message ?? ''} ${err.cause?.message ?? ''}`;
};
const isDenied = (e: unknown) => /permission denied/i.test(errText(e));

/** What app_user may do on a table at all. "Permission denied" only counts as a refusal when it holds no such privilege (else it hides a wrong-reason error). */
async function privs(t: string) {
  const r = await dbs.owner.execute(sql`
    SELECT has_any_column_privilege('app_user', ${regclassOf(t)}, 'SELECT') AS sel,
           has_any_column_privilege('app_user', ${regclassOf(t)}, 'UPDATE') AS upd,
           has_table_privilege('app_user', ${regclassOf(t)}, 'DELETE') AS del`);
  return rowsOf(r)[0] as { sel: boolean; upd: boolean; del: boolean };
}

/** Predicate on the pk columns only (column-level SELECT grants make whole-row `to_jsonb(t)` raise permission denied). */
const pkMatch = (t: string, pk: Pk) => {
  const conds = Object.keys(pk).map((c) => sql`t.${sql.identifier(c)} IS NOT DISTINCT FROM r.${sql.identifier(c)}`);
  return sql`EXISTS (SELECT 1 FROM jsonb_populate_record(null::${qual(t)}, ${JSON.stringify(pk)}::jsonb) r WHERE ${sql.join(conds, sql` AND `)})`;
};

/** How many of the given pk rows are visible, each pk checked individually: the owner (no RLS) or `app_user` under `scope` (null = no tenant context). */
async function visibleCount(who: 'owner' | TenantScope | null, t: string, pks: Pk[]): Promise<number> {
  let n = 0;
  for (const pk of pks) {
    const q = sql`SELECT count(*)::int AS n FROM ${qual(t)} t WHERE ${pkMatch(t, pk)}`;
    try {
      const r = who === 'owner' ? await dbs.owner.execute(q) : who === null ? await dbs.app.execute(q) : await withTenant(dbs.app, who, (tx) => tx.execute(q));
      n += rowsOf(r)[0]!.n;
    } catch (e) {
      if (who !== 'owner' && isDenied(e) && !(await privs(t)).sel) continue; // no SELECT privilege at all: refused
      throw e;
    }
  }
  return n;
}

/** SELECT count(*) of the whole table as app_user; 'denied' only when app_user has no SELECT privilege at all. */
async function visibleTotal(who: TenantScope | null, t: string): Promise<number | 'denied'> {
  const q = sql`SELECT count(*)::int AS n FROM ${qual(t)}`;
  try {
    const r = who === null ? await dbs.app.execute(q) : await withTenant(dbs.app, who, (tx) => tx.execute(q));
    return rowsOf(r)[0]!.n;
  } catch (e) {
    if (isDenied(e) && !(await privs(t)).sel) return 'denied';
    throw e;
  }
}

async function insertableColumns(t: string): Promise<string[]> {
  const r = await dbs.owner.execute(sql`
    SELECT a.attname AS name FROM pg_attribute a
    WHERE a.attrelid = ${regclassOf(t)}::regclass AND a.attnum > 0 AND NOT a.attisdropped
      AND a.attgenerated = '' AND a.attidentity <> 'a' ORDER BY a.attnum`);
  return (r as unknown as { name: string }[]).map((x) => x.name);
}

/** Re-inserts (as app_user under `scope`) the full row identified by `pk`; resolves to the error text, rejects when the INSERT succeeds. */
async function reinsertAs(scope: TenantScope, t: string, pk: Pk): Promise<string> {
  const [row] = (await dbs.owner.execute(sql`SELECT to_jsonb(t) AS j FROM ${qual(t)} t WHERE ${pkMatch(t, pk)}`)) as unknown as { j: unknown }[];
  if (!row) throw new Error(`no row of ${t} matches ${JSON.stringify(pk)}`);
  const cols = sql.join((await insertableColumns(t)).map((c) => sql.identifier(c)), sql`, `);
  return errorText(withTenant(dbs.app, scope, (tx) => tx.execute(sql`
    INSERT INTO ${qual(t)} (${cols}) SELECT ${cols} FROM jsonb_populate_record(null::${qual(t)}, ${JSON.stringify(row.j)}::jsonb)`)));
}

/** A column to UPDATE: preferably one app_user may update (so RLS, not the privilege, is what is proven), else any non-pk column. */
async function updateColumn(t: string, pk: Pk): Promise<string> {
  const cols = (await insertableColumns(t)).filter((c) => !(c in pk));
  for (const c of cols) {
    const r = await dbs.owner.execute(sql`SELECT has_column_privilege('app_user', ${regclassOf(t)}, ${c}, 'UPDATE') AS ok`);
    if (rowsOf(r)[0]!.ok) return c;
  }
  return cols[0] ?? Object.keys(pk)[0]!;
}

async function mutateAs(scope: TenantScope, t: string, pk: Pk, op: 'update' | 'delete'): Promise<number | 'denied'> {
  const col = op === 'update' ? await updateColumn(t, pk) : '';
  const q = op === 'delete'
    ? sql`DELETE FROM ${qual(t)} t WHERE ${pkMatch(t, pk)}`
    : sql`UPDATE ${qual(t)} t SET ${sql.identifier(col)} = t.${sql.identifier(col)} WHERE ${pkMatch(t, pk)}`;
  try { return ((await withTenant(dbs.app, scope, (tx) => tx.execute(q))) as unknown as { count: number }).count; }
  catch (e) {
    const p = await privs(t);
    if (isDenied(e) && !(op === 'update' ? p.upd : p.del)) return 'denied'; // no such privilege at all
    throw e; // any other error (or a denial despite the privilege) fails the case: wrong-reason refusal
  }
}

/** DEFAULT VALUES insert (RLS WITH CHECK / privileges are evaluated before NOT NULL constraints); used where no seeded row exists. */
const defaultInsertAs = (scope: TenantScope, t: string) =>
  errorText(withTenant(dbs.app, scope, (tx) => tx.execute(sql`INSERT INTO ${qual(t)} DEFAULT VALUES`)));

let w: IsolationWorld;
beforeAll(async () => {
  await truncateAll(dbs.owner);
  w = await seedIsolationWorld(dbs.owner);
});

const tablesOf = (cls: TableClass) => Object.entries(TABLE_CLASS).filter(([, c]) => c === cls).map(([t]) => t).sort();
const pksOf = (t: string, tenants: TenantKey[]): Pk[] => tenants.flatMap((k) => w.rows[t]?.[k] ?? []);
const anyPk = (t: string): Pk | undefined => Object.values(w.rows[t] ?? {}).flat()[0] as Pk | undefined;
/** Asserts the owner sees every pk (so a zero for app_user is not a vacuous zero). */
async function expectSeeded(t: string, pks: Pk[]) {
  expect(pks.length, `${t}: no seeded rows to probe`).toBeGreaterThan(0);
  expect(await visibleCount('owner', t, pks), `${t}: owner must see the seeded rows`).toBe(pks.length);
}
const expectNoRows = (n: number | 'denied') => expect(n === 'denied' || n === 0, `visible rows: ${n}`).toBe(true);

describe('catalog', () => {
  it('every public table has RLS enabled and forced', async () => {
    const r = await dbs.owner.execute(sql`
      SELECT c.relname AS t FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND NOT (c.relrowsecurity AND c.relforcerowsecurity) ORDER BY 1`);
    expect(rowsOf(r).map((x) => x.t)).toEqual([]);
  });
});

describe('RLS sweep: tenant_client', () => {
  const tables = tablesOf('tenant_client');
  const mine: TenantKey[] = ['A', 'A1', 'A2'];

  it.each(tables)('%s: B sees none of A / A1 / A2 rows', async (t) => {
    const pks = pksOf(t, mine);
    await expectSeeded(t, pks);
    expect(await visibleCount(scopeB, t, pks)).toBe(0);
  });

  it.each(tables)('%s: [A1] sees no A2 rows', async (t) => {
    const pks = pksOf(t, ['A2']);
    await expectSeeded(t, pks);
    expect(await visibleCount(scopeA1, t, pks)).toBe(0);
  });

  it.each(tables)('%s: no context sees nothing', async (t) => {
    await expectSeeded(t, pksOf(t, [...mine, 'B1']));
    expectNoRows(await visibleTotal(null, t));
  });

  it.each(tables)('%s: B cannot update or delete A rows', async (t) => {
    await expectSeeded(t, pksOf(t, mine));
    for (const k of mine) {
      for (const pk of w.rows[t]?.[k] ?? []) {
        for (const op of ['update', 'delete'] as const) expectNoRows(await mutateAs(scopeB, t, pk, op));
      }
    }
    await expectSeeded(t, pksOf(t, mine)); // nothing was removed
  });

  it.each(tables)('%s: B cannot re-insert an A row', async (t) => {
    const firsts = mine.map((k) => w.rows[t]?.[k]?.[0]).filter((x): x is Pk => !!x);
    expect(firsts.length, `${t}: no A-side row`).toBeGreaterThan(0);
    for (const pk of firsts) expect(await reinsertAs(scopeB, t, pk)).toMatch(REFUSED);
  });
});

describe('RLS sweep: tenant_agency', () => {
  const tables = tablesOf('tenant_agency');

  it.each(tables)('%s: B sees none of A rows', async (t) => {
    const pks = pksOf(t, ['A']);
    await expectSeeded(t, pks);
    expect(await visibleCount(scopeB, t, pks)).toBe(0);
  });

  it.each(tables)('%s: no context sees nothing', async (t) => {
    await expectSeeded(t, pksOf(t, ['A', 'B']));
    expectNoRows(await visibleTotal(null, t));
  });

  it.each(tables)('%s: B cannot update or delete A rows', async (t) => {
    await expectSeeded(t, pksOf(t, ['A']));
    for (const pk of w.rows[t]?.A ?? []) {
      for (const op of ['update', 'delete'] as const) expectNoRows(await mutateAs(scopeB, t, pk, op));
    }
    await expectSeeded(t, pksOf(t, ['A']));
  });

  it.each(tables)('%s: B cannot re-insert an A row', async (t) => {
    const pk = w.rows[t]?.A?.[0];
    expect(pk, `${t}: no A row`).toBeDefined();
    expect(await reinsertAs(scopeB, t, pk!)).toMatch(REFUSED);
  });
});

describe('RLS sweep: global_public', () => {
  const tables = tablesOf('global_public');

  it.each(tables)('%s: B sees no Y-only row; A sees no Z-only row', async (t) => {
    const y = pksOf(t, ['Y']);
    const z = pksOf(t, ['Z']);
    await expectSeeded(t, y);
    await expectSeeded(t, z);
    expect(await visibleCount(scopeB, t, y)).toBe(0);
    expect(await visibleCount(scopeA, t, z)).toBe(0);
    expect(await visibleCount(scopeA1, t, z)).toBe(0);
  });

  it.each(tables)('%s: no context sees nothing', async (t) => {
    await expectSeeded(t, pksOf(t, ['Y', 'Z']));
    expectNoRows(await visibleTotal(null, t));
  });

  it.each(tables)('%s: global_public refuses writes', async (t) => {
    // Y is visible to A and Z to B, so a 0 can only come from the missing write privilege / policy, never from invisibility.
    for (const [scope, k] of [[scopeA, 'Y'], [scopeB, 'Z']] as const) {
      const pk = w.rows[t]?.[k]?.[0]!;
      expect(await visibleCount(scope, t, [pk]), `${t}/${k} visible to its own tenant`).toBe(1);
      for (const op of ['update', 'delete'] as const) expectNoRows(await mutateAs(scope, t, pk, op));
      expect(await reinsertAs(scope, t, pk)).toMatch(REFUSED);
    }
    // and no cross-tenant writes either
    const yPk = w.rows[t]?.Y?.[0]!;
    for (const op of ['update', 'delete'] as const) expectNoRows(await mutateAs(scopeB, t, yPk, op));
    expect(await reinsertAs(scopeB, t, yPk)).toMatch(REFUSED);
    await expectSeeded(t, pksOf(t, ['Y', 'Z']));
  });
});

describe('RLS sweep: service_only', () => {
  const tables = tablesOf('service_only');

  it.each(tables)('%s: forced RLS and no policy for app_user', async (t) => {
    const r = await dbs.owner.execute(sql`
      SELECT c.relrowsecurity AS rls, c.relforcerowsecurity AS forced,
        (SELECT count(*)::int FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = ${t}) AS policies
      FROM pg_class c WHERE c.oid = ${`public.${t}`}::regclass`);
    expect(rowsOf(r)[0]).toEqual({ rls: true, forced: true, policies: 0 });
  });

  it.each(tables)('%s: service_only refuses everything', async (t) => {
    const seeded = anyPk(t);
    if (seeded) {
      // behavioural proof on a real row (the owner sees it, app_user must not)
      const all = Object.values(w.rows[t] ?? {}).flat() as Pk[];
      await expectSeeded(t, all);
      for (const scope of [scopeA, scopeB, scopeA1]) {
        expectNoRows(await visibleTotal(scope, t));
        expect(await visibleCount(scope, t, all)).toBe(0);
        for (const op of ['update', 'delete'] as const) expectNoRows(await mutateAs(scope, t, seeded, op));
        expect(await reinsertAs(scope, t, seeded)).toMatch(REFUSED);
      }
      expectNoRows(await visibleTotal(null, t));
      await expectSeeded(t, all);
    } else {
      // not seedable by tenant (no tenant/competitor column): privilege-state proof + a DEFAULT VALUES insert that must hit the
      // privilege / RLS check first (never a NOT NULL error); SELECT/UPDATE/DELETE on the table must be denied or empty-by-policy.
      const r = await dbs.owner.execute(sql`
        SELECT has_table_privilege('app_user', ${`public.${t}`}, 'SELECT') AS sel,
               has_any_column_privilege('app_user', ${`public.${t}`}, 'INSERT') AS ins,
               has_any_column_privilege('app_user', ${`public.${t}`}, 'UPDATE') AS upd,
               has_table_privilege('app_user', ${`public.${t}`}, 'DELETE') AS del`);
      const p = rowsOf(r)[0]!;
      expect(p.ins || p.upd || p.del, `${t}: app_user must hold no write privilege`).toBe(false);
      expect(await defaultInsertAs(scopeA, t)).toMatch(REFUSED);
      expect(await defaultInsertAs(scopeB, t)).toMatch(REFUSED);
      for (const scope of [scopeA, scopeB]) {
        expectNoRows(await visibleTotal(scope, t));
        const upd = await withTenant(dbs.app, scope, (tx) => tx.execute(sql`DELETE FROM ${qual(t)}`)).then(
          (x) => (x as unknown as { count: number }).count,
          (e: unknown) => {
            if (!isDenied(e) || p.del) throw e; // denial is only a valid refusal when app_user holds no DELETE privilege
            return 'denied' as const;
          },
        );
        expectNoRows(upd);
      }
    }
  });
});

describe('RLS sweep: platform', () => {
  const tables = tablesOf('platform');

  it.each(tables)('%s: forced RLS, no policy, no app_user write privilege', async (t) => {
    const r = await dbs.owner.execute(sql`
      SELECT c.relforcerowsecurity AS forced,
        (SELECT count(*)::int FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = ${t}) AS policies,
        has_any_column_privilege('app_user', ${`public.${t}`}, 'INSERT') AS ins,
        has_any_column_privilege('app_user', ${`public.${t}`}, 'UPDATE') AS upd,
        has_table_privilege('app_user', ${`public.${t}`}, 'DELETE') AS del
      FROM pg_class c WHERE c.oid = ${`public.${t}`}::regclass`);
    // none of the platform tables is on the evidence.test.ts app_user write allow-list (client, ask_*, agency_profile, ... are tenant tables)
    expect(rowsOf(r)[0]).toEqual({ forced: true, policies: 0, ins: false, upd: false, del: false });
  });

  it.each(tables)('%s: app_user reads, updates, deletes and inserts nothing', async (t) => {
    const [row] = rowsOf(await dbs.owner.execute(sql`SELECT to_jsonb(t) AS j FROM ${qual(t)} t LIMIT 1`));
    for (const scope of [scopeA, scopeB]) {
      expectNoRows(await visibleTotal(scope, t));
      expect(await defaultInsertAs(scope, t)).toMatch(REFUSED);
    }
    expectNoRows(await visibleTotal(null, t));
    if (!row) return; // empty table: the catalog case above (no write privilege, no policy) is the proof
    // a real row, found through the owner (a check against zero rows would be a false green)
    const pk = row.j as Pk;
    expect(await visibleCount('owner', t, [pk])).toBe(1);
    for (const scope of [scopeA, scopeB]) {
      expect(await visibleCount(scope, t, [pk])).toBe(0);
      for (const op of ['update', 'delete'] as const) expectNoRows(await mutateAs(scope, t, pk, op));
      expect(await reinsertAs(scope, t, pk)).toMatch(REFUSED);
    }
    expect(await visibleCount('owner', t, [pk])).toBe(1);
  });

  it('plan and platform_admin are seeded, so their checks ran against real rows', async () => {
    for (const t of ['plan', 'platform_admin']) {
      const r = await dbs.owner.execute(sql`SELECT count(*)::int AS n FROM ${qual(t)}`);
      expect(rowsOf(r)[0]!.n, t).toBeGreaterThan(0);
    }
  });
});

/**
 * Positive control: under the table's own tenant (agency admin of A) at least one of its rows IS visible, so a blanket
 * privilege error or an always-empty table can never read as isolation. Tables where app_user holds no SELECT privilege
 * are skipped (the 0 is then the privilege itself, asserted by the catalog); tables whose policy needs more than a plain
 * agency-admin scope are listed with a reason.
 */
const adminA: TenantScope = { agencyId: IDS.agencyA, clientScope: 'all', userId: 'world-admin-a', role: 'agency_admin' };
/** Author-only policies (ask_thread / ask_message: user_id = app_user_id()): the thread's own author, A1's owner, sees A1's rows. */
const authorA1: TenantScope = { agencyId: IDS.agencyA, clientScope: [IDS.clientA1], userId: 'world-owner-a1', role: 'client_owner' };
const POSITIVE_SCOPE: Record<string, { scope: TenantScope; tenants: TenantKey[] }> = {
  ask_thread: { scope: authorA1, tenants: ['A1'] },
  ask_message: { scope: authorA1, tenants: ['A1'] },
};
const POSITIVE_EXCEPTIONS: Record<string, string> = {};
describe('RLS sweep: positive control (own tenant sees own rows)', () => {
  const tables = [...tablesOf('tenant_client'), ...tablesOf('tenant_agency')];
  it.each(tables)('%s: agency admin of A sees A rows', async (t) => {
    if (POSITIVE_EXCEPTIONS[t]) return;
    if (!(await privs(t)).sel) return;
    const o = POSITIVE_SCOPE[t];
    const pks = pksOf(t, o?.tenants ?? ['A', 'A1', 'A2']);
    expect(await visibleCount(o?.scope ?? adminA, t, pks), `${t}: own tenant sees none of its rows`).toBeGreaterThan(0);
  });
});

describe('RLS sweep self-test (probe table with a permissive policy)', () => {
  const probe = 'cs_sweep_probe.leaky';
  const pk: Pk = { id: '00000000-0000-4000-8000-000000000001', agency_id: IDS.agencyA };

  beforeAll(async () => {
    await dbs.owner.execute(sql`DROP SCHEMA IF EXISTS cs_sweep_probe CASCADE`);
    await dbs.owner.execute(sql`CREATE SCHEMA cs_sweep_probe`);
    await dbs.owner.execute(sql`CREATE TABLE cs_sweep_probe.leaky (id uuid PRIMARY KEY, agency_id uuid NOT NULL, note text)`);
    await dbs.owner.execute(sql`ALTER TABLE cs_sweep_probe.leaky ENABLE ROW LEVEL SECURITY`);
    await dbs.owner.execute(sql`ALTER TABLE cs_sweep_probe.leaky FORCE ROW LEVEL SECURITY`);
    await dbs.owner.execute(sql`CREATE POLICY leaky_all ON cs_sweep_probe.leaky FOR ALL USING (true) WITH CHECK (true)`);
    await dbs.owner.execute(sql`GRANT USAGE ON SCHEMA cs_sweep_probe TO app_user`);
    await dbs.owner.execute(sql`GRANT SELECT, INSERT, UPDATE, DELETE ON cs_sweep_probe.leaky TO app_user`);
    await dbs.owner.execute(sql`INSERT INTO cs_sweep_probe.leaky (id, agency_id, note) VALUES (${pk.id as string}, ${IDS.agencyA}, 'CANARY-probe')`);
  });

  it('sweep catches a probe table with USING (true)', async () => {
    // visibility: B sees A's row
    expect(await visibleCount('owner', probe, [pk])).toBe(1);
    expect(await visibleCount(scopeB, probe, [pk])).toBe(1);
    expect(await visibleCount(null, probe, [pk])).toBe(1);
    expect(await visibleTotal(scopeB, probe)).toBe(1);
    // writes: B's re-insert gets past RLS (only the unique key refuses it, which the sweep's REFUSED match would flag as a leak)
    const text = await reinsertAs(scopeB, probe, pk);
    expect(text).toMatch(/duplicate key/i);
    expect(text).not.toMatch(REFUSED);
    // B can update and delete A's row
    expect(await mutateAs(scopeB, probe, pk, 'update')).toBe(1);
    expect(await mutateAs(scopeB, probe, pk, 'delete')).toBe(1);
    expect(await visibleCount('owner', probe, [pk])).toBe(0);
  });
});

describe('RLS sweep self-test (column-level SELECT grant)', () => {
  const probe = 'cs_sweep_probe.partial';
  const pk: Pk = { id: '00000000-0000-4000-8000-000000000002' };

  beforeAll(async () => {
    await dbs.owner.execute(sql`CREATE SCHEMA IF NOT EXISTS cs_sweep_probe`);
    await dbs.owner.execute(sql`DROP TABLE IF EXISTS cs_sweep_probe.partial`);
    await dbs.owner.execute(sql`CREATE TABLE cs_sweep_probe.partial (id uuid PRIMARY KEY, agency_id uuid NOT NULL, secret text)`);
    await dbs.owner.execute(sql`ALTER TABLE cs_sweep_probe.partial ENABLE ROW LEVEL SECURITY`);
    await dbs.owner.execute(sql`ALTER TABLE cs_sweep_probe.partial FORCE ROW LEVEL SECURITY`);
    await dbs.owner.execute(sql`CREATE POLICY partial_all ON cs_sweep_probe.partial FOR ALL USING (true) WITH CHECK (true)`);
    await dbs.owner.execute(sql`GRANT USAGE ON SCHEMA cs_sweep_probe TO app_user`);
    await dbs.owner.execute(sql`GRANT SELECT (id, agency_id), UPDATE (agency_id), DELETE ON cs_sweep_probe.partial TO app_user`);
    await dbs.owner.execute(sql`INSERT INTO cs_sweep_probe.partial (id, agency_id, secret) VALUES (${pk.id as string}, ${IDS.agencyA}, 'CANARY-probe')`);
  });

  it('a permissive policy is caught even when whole-row reads are denied (api_token shape)', async () => {
    expect((await privs(probe)).sel).toBe(true);
    expect(await visibleCount(scopeB, probe, [pk])).toBe(1);
    expect(await visibleTotal(scopeB, probe)).toBe(1);
    expect(await mutateAs(scopeB, probe, pk, 'update')).toBe(1);
    expect(await mutateAs(scopeB, probe, pk, 'delete')).toBe(1);
    expect(await visibleCount('owner', probe, [pk])).toBe(0);
  });
});
