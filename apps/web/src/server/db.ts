import 'server-only';
import { createDb, type Db, type EnvName } from '@cs/db';
import { instrumentSql } from './db-timing';
import { perEnv } from './env-cache';
import { envUrls } from './runtime-env';
import { profilingOn } from './tool-timing';

interface DbSet {
  app: Db;
  service: Db;
  close(): Promise<void>;
}

/** One pool per role per environment per server process (Fluid compute reuses it across requests). */
const sets = perEnv<DbSet>(
  (name) => {
    const u = envUrls(name);
    // 7a1 Task 9: `PROFILE_TOOLS=1` only (never in a deployed env) — each query becomes a `db` span for `profile:pages`.
    const opts = profilingOn() ? { instrument: (c: Parameters<typeof instrumentSql>[0]) => instrumentSql(c) } : {};
    const app = createDb(u.app, opts);
    const service = createDb(u.service, opts);
    return { app: app.db, service: service.db, close: async () => { await Promise.all([app.close(), service.close()]); } };
  },
  (s) => s.close(),
);

/** The live environment's pools, or the named environment's when `name` is given (final-review I1). */
export function dbs(name?: EnvName): { app: Db; service: Db } {
  const { app, service } = sets(name);
  return { app, service };
}
