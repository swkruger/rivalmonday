import { createDb } from '@cs/db';
import { testUrls } from '@cs/db/test-helpers';
import { sql as dsql } from 'drizzle-orm';
import type postgres from 'postgres';
import { describe, expect, it, vi } from 'vitest';
import { instrumentSql, sqlLabel } from './db-timing';
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
    await vi.waitFor(() => expect(records.map((r) => r.tool)).toEqual(['select client', 'select event']));
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
      await vi.waitFor(() => expect(records).toHaveLength(3));
      expect(records.every((r) => r.kind === 'db' && r.path === '/p')).toBe(true);
      expect(JSON.stringify(records)).not.toContain('secret-value');
    } finally {
      await close();
    }
  });
});
