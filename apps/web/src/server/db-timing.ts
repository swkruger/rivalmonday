import { headers } from 'next/headers';
import type { Pool, PoolClient } from 'pg';
import type postgres from 'postgres';
import { nowMs, profilingOn, recordToolTiming, type ToolTiming } from './tool-timing';

/**
 * 7a1 Task 9 (review fix 1): one `kind: 'db'` span per postgres round trip on the web's drizzle pools, so
 * `profile:pages` can count sequential DB stages including the shell's direct reads. Installed only when the server
 * starts with `PROFILE_TOOLS=1` (`server/db.ts`); otherwise the pools are the bare clients. Never throws into a query,
 * never records query text or parameters: the label is the first keyword and the first table (`select client`).
 * Launch-gate (D5): `unsafe` spans are `source: 'app'` (absent; the gated count); BEGIN/COMMIT (savepoint/release,
 * rollback) and tagged-template `sql\`…\`` round trips are `source: 'tx'`; Better Auth's `pg` pool is wrapped by
 * `instrumentPgPool` (`source: 'auth'`). Auth and tx spans are reported, never asserted.
 */

/** The request's `x-rm-path`, '' outside a request. */
export async function requestPath(): Promise<string> {
  try {
    return (await headers()).get('x-rm-path') ?? '';
  } catch {
    return '';
  }
}

export function sqlLabel(query: string): string {
  const q = query.replace(/'(?:[^']|'')*'/g, "''"); // literals never reach the label
  const keyword = /^\s*([a-z]+)/i.exec(q)?.[1]?.toLowerCase();
  if (!keyword) return 'query';
  const table = /\b(?:from|into|update)\s+(?:"?\w+"?\.)?"?(\w+)"?/i.exec(q)?.[1];
  return table ? `${keyword} ${table}` : keyword;
}

interface TimingDeps {
  record: (e: ToolTiming) => void;
  path: () => Promise<string>;
}

type Thenable = { then: (onF?: (v: unknown) => unknown, onR?: (e: unknown) => unknown) => unknown };
type Source = ToolTiming['source'];
type Rec = (label: string, startMs: number, endMs: number, source?: Source) => void;

/** Records one db span once the request path is known; never throws (profiling must never break a query). */
function recorder(deps: Partial<TimingDeps>): Rec {
  const record = deps.record ?? recordToolTiming;
  const path = deps.path ?? requestPath;
  return (label, startMs, endMs, source) => {
    void Promise.resolve()
      .then(path)
      .catch(() => '')
      .then((p) => {
        try {
          record({ path: p, tool: label, startMs, endMs, kind: 'db', ...(source ? { source } : {}) });
        } catch {
          // profiling must never break a query
        }
      });
  };
}

const isTemplate = (a: unknown): a is TemplateStringsArray => Array.isArray(a) && 'raw' in a;
const isThenable = (v: unknown): v is Thenable => !!v && typeof (v as Thenable).then === 'function';

/**
 * Wraps a postgres-js client so every `unsafe` query (drizzle's only path), in or out of a transaction, is timed;
 * plus BEGIN/COMMIT around `begin`/`savepoint` callbacks and awaited tagged-template calls (`source: 'tx'`).
 */
export function instrumentSql(client: postgres.Sql, deps: Partial<TimingDeps> = {}): postgres.Sql {
  const rec = recorder(deps);

  const timed = <Q extends Thenable>(q: Q, label: string, source?: Source): Q => {
    const original = q.then;
    let done = false;
    // postgres-js runs a query when it is first `then`-ed, so the span starts there; `.values()` returns the same object.
    q.then = function (this: Q, onF?: (v: unknown) => unknown, onR?: (e: unknown) => unknown) {
      const startMs = nowMs();
      const finish = () => {
        if (done) return;
        done = true;
        rec(label, startMs, nowMs(), source);
      };
      return original.call(
        q,
        (v) => { finish(); return onF ? onF(v) : v; },
        (e) => { finish(); if (onR) return onR(e); throw e; },
      );
    } as Q['then'];
    return q;
  };

  const wrap = (sql: postgres.Sql): postgres.Sql =>
    new Proxy(sql, {
      // A tagged-template call (sql`select …`) is a round trip once awaited; `sql(obj)` / `sql('col')` are helpers.
      // A fragment nested inside another template is never `then`-ed itself, so it records nothing.
      apply(target, thisArg, args: unknown[]) {
        const out: unknown = Reflect.apply(target as unknown as (...a: unknown[]) => unknown, thisArg, args);
        return isTemplate(args[0]) && isThenable(out) ? timed(out, sqlLabel(args[0].join('$')), 'tx') : out;
      },
      get(target, prop) {
        if (prop === 'unsafe') {
          return (query: string, ...rest: unknown[]) =>
            timed((target.unsafe as (...a: unknown[]) => Thenable)(query, ...rest), sqlLabel(query));
        }
        if (prop === 'begin' || prop === 'savepoint') {
          return (...args: unknown[]) => {
            // BEGIN (SAVEPOINT) = call → callback starts; COMMIT (RELEASE) or ROLLBACK = callback settles → call settles.
            const [open, close] = prop === 'begin' ? ['begin', 'commit'] : ['savepoint', 'release'];
            const calledMs = nowMs();
            let opened = false;
            let settledMs: number | null = null;
            const i = args.findIndex((a) => typeof a === 'function');
            if (i >= 0) {
              const cb = args[i] as (tx: postgres.Sql) => unknown;
              args[i] = (tx: postgres.Sql) => {
                if (!opened) {
                  opened = true;
                  rec(open!, calledMs, nowMs(), 'tx');
                }
                const r = cb(wrap(tx));
                // postgres-js awaits an array of queries with Promise.all; keep that meaning.
                return Promise.resolve(Array.isArray(r) ? Promise.all(r) : r).then(
                  (v) => { settledMs = nowMs(); return v; },
                  (e: unknown) => { settledMs = nowMs(); throw e; },
                );
              };
            }
            // `savepoint` exists only on a transaction client (postgres-js `TransactionSql`).
            const p: unknown = (Reflect.get(target, prop, target) as (...a: unknown[]) => unknown)(...args);
            if (i < 0 || !isThenable(p)) return p;
            return (p as Promise<unknown>).then(
              (v) => { if (settledMs !== null) rec(close!, settledMs, nowMs(), 'tx'); return v; },
              (e: unknown) => { if (settledMs !== null) rec('rollback', settledMs, nowMs(), 'tx'); throw e; },
            );
          };
        }
        return Reflect.get(target, prop, target);
      },
    });

  return wrap(client);
}

const WRAPPED = Symbol('rm.pgTimed');
type Queryable = { query: (...a: unknown[]) => unknown; [WRAPPED]?: true };

/** `pg` query text from `query(text, …)` or `query({ text, … })`; null for anything else (a Submittable stays untimed). */
function pgText(a: unknown): string | null {
  if (typeof a === 'string') return a;
  if (!a || typeof a !== 'object' || typeof (a as { submit?: unknown }).submit === 'function') return null;
  const text = (a as { text?: unknown }).text;
  return typeof text === 'string' ? text : null;
}

/** Times `target.query` in place, once (pg hands the same pooled client out again). */
function wrapPgQuery(target: Queryable, rec: Rec): void {
  if (target[WRAPPED]) return;
  const original = target.query;
  target.query = function (this: unknown, ...args: unknown[]) {
    const text = pgText(args[0]);
    if (text === null) return original.apply(this, args);
    const label = sqlLabel(text);
    const startMs = nowMs();
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      rec(label, startMs, nowMs(), 'auth');
    };
    const cbAt = args.length > 1 && typeof args[args.length - 1] === 'function' ? args.length - 1 : -1;
    if (cbAt >= 0) {
      const cb = args[cbAt] as (...r: unknown[]) => unknown;
      args[cbAt] = (...r: unknown[]) => { finish(); return cb(...r); };
      return original.apply(this, args);
    }
    const out: unknown = original.apply(this, args);
    // A side branch only: the caller gets `out` itself, so results and rejections are unchanged.
    if (isThenable(out)) (out as Promise<unknown>).then(finish, finish);
    return out;
  };
  target[WRAPPED] = true;
}

/**
 * Launch-gate (spec § Profiler): Better Auth's `pg` pool emits one `source: 'auth'` db span per query. Recorded at one
 * layer only, the clients `pool.connect` hands out (Kysely's path): pg-pool's `pool.query` itself runs through
 * `this.connect` and the client's `query`, so also timing `pool.query` would count each pool-level query twice. Labels
 * as `sqlLabel` (no text or params). Unless profiling is on (`PROFILE_TOOLS=1`) the pool is returned untouched. Never
 * changes a result or an error.
 */
export function instrumentPgPool(pool: Pool, deps: Partial<TimingDeps> & { on?: () => boolean } = {}): Pool {
  if (!(deps.on ?? profilingOn)()) return pool;
  const rec = recorder(deps);
  const connect = pool.connect.bind(pool) as (...a: unknown[]) => unknown;
  (pool as unknown as { connect: (...a: unknown[]) => unknown }).connect = (...args: unknown[]) => {
    if (typeof args[0] === 'function') {
      const cb = args[0] as (e: unknown, c?: PoolClient, done?: unknown) => void;
      return connect((e: unknown, c?: PoolClient, done?: unknown) => {
        if (c) wrapPgQuery(c as unknown as Queryable, rec);
        cb(e, c, done);
      });
    }
    return (connect() as Promise<PoolClient>).then((c) => {
      wrapPgQuery(c as unknown as Queryable, rec);
      return c;
    });
  };
  return pool;
}
