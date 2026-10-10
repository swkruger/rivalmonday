import 'server-only';
import { createDb, type Db, type EnvName } from '@cs/db';
import { perEnv } from './env-cache';
import { envUrls } from './runtime-env';

interface DbSet {
  app: Db;
  service: Db;
  close(): Promise<void>;
}

/** One pool per role per environment per server process (Fluid compute reuses it across requests). */
const sets = perEnv<DbSet>(
  (name) => {
    const u = envUrls(name);
    const app = createDb(u.app);
    const service = createDb(u.service);
    return { app: app.db, service: service.db, close: async () => { await Promise.all([app.close(), service.close()]); } };
  },
  (s) => s.close(),
);

/** The live environment's pools, or the named environment's when `name` is given (final-review I1). */
export function dbs(name?: EnvName): { app: Db; service: Db } {
  const { app, service } = sets(name);
  return { app, service };
}
