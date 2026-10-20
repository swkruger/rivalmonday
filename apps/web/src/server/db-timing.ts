import { headers } from 'next/headers';
import type postgres from 'postgres';
import { nowMs, recordToolTiming, type ToolTiming } from './tool-timing';

/**
 * 7a1 Task 9 (review fix 1): one `kind: 'db'` span per postgres round trip on the web's drizzle pools, so
 * `profile:pages` can count sequential DB stages including the shell's direct reads. Installed only when the server
 * starts with `PROFILE_TOOLS=1` (`server/db.ts`); otherwise the pools are the bare clients. Never throws into a query,
 * never records query text or parameters: the label is the first keyword and the first table (`select client`).
 * Not covered: Better Auth's own `pg` pool (session lookups) and tagged-template `sql\`…\`` calls (drizzle uses `unsafe`).
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

/** Wraps a postgres-js client so every `unsafe` query (drizzle's only path), in or out of a transaction, is timed. */
export function instrumentSql(client: postgres.Sql, deps: Partial<TimingDeps> = {}): postgres.Sql {
  const record = deps.record ?? recordToolTiming;
  const path = deps.path ?? requestPath;

  const timed = <Q extends Thenable>(q: Q, label: string): Q => {
    const original = q.then;
    let done = false;
    // postgres-js runs a query when it is first `then`-ed, so the span starts there; `.values()` returns the same object.
    q.then = function (this: Q, onF?: (v: unknown) => unknown, onR?: (e: unknown) => unknown) {
      const startMs = nowMs();
      const finish = () => {
        if (done) return;
        done = true;
        const endMs = nowMs();
        void Promise.resolve()
          .then(path)
          .catch(() => '')
          .then((p) => {
            try {
              record({ path: p, tool: label, startMs, endMs, kind: 'db' });
            } catch {
              // profiling must never break a query
            }
          });
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
      get(target, prop) {
        if (prop === 'unsafe') {
          return (query: string, ...rest: unknown[]) =>
            timed((target.unsafe as (...a: unknown[]) => Thenable)(query, ...rest), sqlLabel(query));
        }
        if (prop === 'begin' || prop === 'savepoint') {
          return (...args: unknown[]) => {
            const i = args.findIndex((a) => typeof a === 'function');
            if (i >= 0) {
              const cb = args[i] as (tx: postgres.Sql) => unknown;
              args[i] = (tx: postgres.Sql) => cb(wrap(tx));
            }
            // `savepoint` exists only on a transaction client (postgres-js `TransactionSql`).
            return (Reflect.get(target, prop, target) as (...a: unknown[]) => unknown)(...args);
          };
        }
        return Reflect.get(target, prop, target);
      },
    });

  return wrap(client);
}
