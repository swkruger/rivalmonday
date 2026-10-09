import 'server-only';
import { createDb, type Db } from '@cs/db';
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

export function dbs(): { app: Db; service: Db } {
  const { app, service } = sets();
  return { app, service };
}
