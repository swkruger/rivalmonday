import 'server-only';
import { createDb, type Db } from '@cs/db';
import { webEnv } from './env';

let cached: { app: Db; service: Db } | null = null;

/** One pool per role per server process (Fluid compute reuses it across requests). */
export function dbs(): { app: Db; service: Db } {
  if (!cached) {
    const env = webEnv();
    cached = { app: createDb(env.appDatabaseUrl).db, service: createDb(env.serviceDatabaseUrl).db };
  }
  return cached;
}
