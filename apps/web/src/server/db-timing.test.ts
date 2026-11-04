import { createDb } from '@cs/db';
import { testUrls } from '@cs/db/test-helpers';
import { sql as dsql } from 'drizzle-orm';
import type { Pool } from 'pg';
import postgres from 'postgres';
import { describe, expect, it, vi } from 'vitest';
import { instrumentPgPool, instrumentSql, sqlLabel } from './db-timing';
import type { ToolTiming } from './tool-timing';

describe('sqlLabel', () => {
  it.each([
    ['select "id", "name" from "client" where "client"."id" = $1', 'select client'],
    ['insert into "audit_log" ("a") values ($1)', 'insert audit_log'],
    ['update "brief" set "status" = $1 where "id" = $2', 'update brief'],
    ['delete from "event" where id = $1', 'delete event'],
    ["select set_config('app.agency_id', $1, true)", 'select'],
    ['with x as (select 1) select * from x', 'with x'],
    ['  SELECT count(*) FROM public.client_billing c', 'select client_billing'],
    ['', 'query'],
  ])('%s → %s', (q, want) => {
    expect(sqlLabel(q)).toBe(want);
  });
  it('never carries literals or parameters', () => {
    expect(sqlLabel("select * from \"user\" where email = 'a@b.test'")).toBe('select user');
  });
});

/** A stand-in for postgres-js: `unsafe` returns a lazy thenable whose `values()` returns itself, like PendingQuery. */
function fakeSql(opts: { fail?: boolean } = {}) {
  const pending = (rows: unknown[]) => {
    const q = {
      values() { return q; },
      then(onF?: (v: unknown) => unknown, onR?: (e: unknown) => unknown) {
        const p = opts.fail ? Promise.reject(new Error('db down')) : Promise.resolve(rows);
        return p.then(onF, onR);
      },
    };
    return q;
  };
  const sql = {
    unsafe: vi.fn((_q: string, _p?: unknown[]) => pending([{ ok: 1 }])),
    begin: vi.fn(async (cb: (tx: unknown) => unknown) => cb(sql)),
    savepoint: vi.fn(async (cb: (tx: unknown) => unknown) => cb(sql)),
    options: { parsers: {} as Record<string, unknown> },
  };
  return sql;
}

describe('instrumentSql', () => {
  const setup = (fail = false) => {
    const records: ToolTiming[] = [];
    const raw = fakeSql({ fail });
    const sql = instrumentSql(raw as unknown as postgres.Sql, { record: (e) => records.push(e), path: async () => '/agency' }) as unknown as ReturnType<typeof fakeSql>;
    return { raw, sql, records };
  };

  it('records one db span per awaited query (with or without .values()), labelled without text or params', async () => {
    const { sql, records } = setup();
    await expect(sql.unsafe('select * from "client" where id = $1', ['secret-id']).values()).resolves.toEqual([{ ok: 1 }]);
    await sql.unsafe('update "brief" set x = $1', ['secret']);
    await vi.waitFor(() => expect(records).toHaveLength(2));
    expect(records.map((r) => [r.kind, r.tool, r.path])).toEqual([['db', 'select client', '/agency'], ['db', 'update brief', '/agency']]);
    expect(JSON.stringify(records)).not.toContain('secret');
    expect(records[0]!.endMs).toBeGreaterThanOrEqual(records[0]!.startMs);
  });

  it('times queries inside begin and savepoint callbacks', async () => {
    const { sql, records } = setup();
    await sql.begin(async (tx) => {
      await (tx as typeof sql).unsafe('select 1 from "client"');
      await (tx as typeof sql).savepoint(async (sp) => (sp as typeof sql).unsafe('select 1 from "event"'));
    });
    await vi.waitFor(() => expect(records.filter((r) => !r.source).map((r) => r.tool)).toEqual(['select client', 'select event']));
    await vi.waitFor(() => expect(records.filter((r) => r.source === 'tx').map((r) => r.tool).sort()).toEqual(['begin', 'commit', 'release', 'savepoint']));
  });

  it('records begin and commit round trips as tx spans around the app spans of the callback', async () => {
    const { sql, records } = setup();
    await sql.begin(async (tx) => { await (tx as typeof sql).unsafe('select 1 from "client"'); });
    await vi.waitFor(() => expect(records).toHaveLength(3));
    const byTool = Object.fromEntries(records.map((r) => [r.tool, r]));
    expect(byTool.begin).toMatchObject({ kind: 'db', source: 'tx' });
    expect(byTool.commit).toMatchObject({ kind: 'db', source: 'tx' });
    expect(byTool['select client']!.source).toBeUndefined(); // app
    expect(byTool.begin!.endMs).toBeLessThanOrEqual(byTool['select client']!.startMs);
    expect(byTool.commit!.startMs).toBeGreaterThanOrEqual(byTool['select client']!.endMs);
  });

  it('records a rolled-back transaction as begin + rollback and still rejects', async () => {
    const { sql, records } = setup();
    await expect(sql.begin(async () => { throw new Error('nope'); })).rejects.toThrow('nope');
    await vi.waitFor(() => expect(records.map((r) => r.tool).sort()).toEqual(['begin', 'rollback']));
  });

  it('passes everything else through (drizzle sets parsers on options)', () => {
    const { raw, sql } = setup();
    sql.options.parsers['114'] = 'x';
    expect(raw.options.parsers['114']).toBe('x');
  });

  it('still rejects a failed query, records it, and never throws when recording fails', async () => {
    const { sql, records } = setup(true);
    await expect(sql.unsafe('select 1 from "client"')).rejects.toThrow('db down');
    await vi.waitFor(() => expect(records).toHaveLength(1));
    const broken = instrumentSql(fakeSql() as unknown as postgres.Sql, { record: () => { throw new Error('disk full'); }, path: async () => { throw new Error('no request'); } }) as unknown as ReturnType<typeof fakeSql>;
    await expect(broken.unsafe('select 1')).resolves.toEqual([{ ok: 1 }]);
  });
});

/** A stand-in for `pg`'s Pool: `query` and pooled clients' `query` resolve `{ rows }` (or call back). */
function fakePool() {
  const result = { rows: [{ ok: 1 }], rowCount: 1 };
  const client = {
    query: vi.fn((_text: unknown, _values?: unknown, cb?: unknown) => {
      const done = typeof _values === 'function' ? _values : cb;
      if (typeof done === 'function') { setTimeout(() => (done as (e: unknown, r: unknown) => void)(null, result), 0); return undefined; }
      return Promise.resolve(result);
    }),
    release: vi.fn(),
  };
  const pool = {
    query: vi.fn(async (_text: unknown, _values?: unknown) => result),
    connect: vi.fn(async () => client),
    end: vi.fn(),
    options: { max: 5 },
  };
  return { pool, client, result };
}

describe('instrumentPgPool', () => {
  const setup = (on = true) => {
    const records: ToolTiming[] = [];
    const raw = fakePool();
    const queryMock = raw.pool.query; // the wrapper replaces pool.query in place
    const pool = instrumentPgPool(raw.pool as unknown as Pool, { record: (e) => records.push(e), path: async () => '/agency', on: () => on }) as unknown as ReturnType<typeof fakePool>['pool'];
    return { ...raw, queryMock, wrapped: pool, records };
  };

  it('records one auth span per pool.query and passes the result through unchanged', async () => {
    const { wrapped, records, result } = setup();
    await expect(wrapped.query('select * from "auth"."session" where token = $1', ['secret-token'])).resolves.toBe(result);
    await wrapped.query({ text: 'update "auth"."session" set x = $1', values: ['secret'] });
    await vi.waitFor(() => expect(records).toHaveLength(2));
    expect(records.map((r) => [r.kind, r.source, r.tool, r.path])).toEqual([['db', 'auth', 'select session', '/agency'], ['db', 'auth', 'update session', '/agency']]);
    expect(JSON.stringify(records)).not.toContain('secret');
  });

  it('records one auth span per query on a client from pool.connect (the Kysely path), callback form included', async () => {
    const { wrapped, records, result } = setup();
    const c = await wrapped.connect();
    await expect(c.query('select 1 from "auth"."user"')).resolves.toBe(result);
    const viaCb = await new Promise((resolve, reject) => c.query('select 1 from "auth"."account"', [], (e: unknown, r: unknown) => (e ? reject(e) : resolve(r))));
    expect(viaCb).toBe(result);
    const again = await wrapped.connect(); // pg hands the same client back: never double-wrapped
    await again.query('select 1 from "auth"."verification"');
    await vi.waitFor(() => expect(records.map((r) => r.tool)).toEqual(['select user', 'select account', 'select verification']));
    expect(records.every((r) => r.source === 'auth' && r.kind === 'db')).toBe(true);
  });

  it('returns the pool untouched when profiling is off', () => {
    const { pool, wrapped } = setup(false);
    expect(wrapped).toBe(pool);
    expect(pool.query).toBe(wrapped.query);
    expect(pool.connect).toBe(wrapped.connect);
  });

  it('rejects a failed query as before and records it', async () => {
    const { wrapped, records, queryMock } = setup();
    queryMock.mockRejectedValueOnce(new Error('db down'));
    await expect(wrapped.query('select 1')).rejects.toThrow('db down');
    await vi.waitFor(() => expect(records).toHaveLength(1));
  });
});

describe('instrumentSql on a real drizzle pool (createDb instrument option)', () => {
  it('keeps drizzle working (parsers, transactions) and times each round trip', async () => {
    const records: ToolTiming[] = [];
    const { db, close } = createDb(testUrls.service, { instrument: (c) => instrumentSql(c, { record: (e) => records.push(e), path: async () => '/p' }) });
    try {
      const [row] = await db.execute<{ n: number; j: unknown }>(dsql`select 1::int as n, '{"a":1}'::jsonb as j`);
      expect(row).toEqual({ n: 1, j: { a: 1 } });
      const inTx = await db.transaction(async (tx) => {
        await tx.execute(dsql`select set_config('app.x', ${'secret-value'}, true)`);
        return [...(await tx.execute<{ v: string }>(dsql`select current_setting('app.x') as v`))][0]!.v;
      });
      expect(inTx).toBe('secret-value');
      await vi.waitFor(() => expect(records).toHaveLength(5));
      expect(records.every((r) => r.kind === 'db' && r.path === '/p')).toBe(true);
      expect(records.filter((r) => !r.source)).toHaveLength(3); // drizzle's queries are app spans
      expect(records.filter((r) => r.source === 'tx').map((r) => r.tool).sort()).toEqual(['begin', 'commit']);
      expect(JSON.stringify(records)).not.toContain('secret-value');
    } finally {
      await close();
    }
  });

  it('times a tagged-template sql call as one tx span (helpers like sql(obj) are not queries)', async () => {
    const records: ToolTiming[] = [];
    const raw = postgres(testUrls.service, { max: 1 });
    const sql = instrumentSql(raw, { record: (e) => records.push(e), path: async () => '/p' });
    try {
      const rows = await sql`select ${'secret-value'}::text as v from pg_class limit 1`;
      expect(rows[0]).toEqual({ v: 'secret-value' });
      await vi.waitFor(() => expect(records).toHaveLength(1));
      expect(records[0]).toMatchObject({ kind: 'db', source: 'tx', tool: 'select pg_class' });
      expect(JSON.stringify(records)).not.toContain('secret-value');
    } finally {
      await raw.end();
    }
  });
});
