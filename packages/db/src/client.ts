import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

export interface CreateDbOptions {
  /**
   * Wraps the postgres client drizzle runs on (7a1 Task 9: the web's `PROFILE_TOOLS=1` query timer). The returned client
   * must behave exactly like the one passed in; `close` always ends the original.
   */
  instrument?: (client: postgres.Sql) => postgres.Sql;
}

export function createDb(url: string, opts: CreateDbOptions = {}) {
  const sqlClient = postgres(url, { max: 5, onnotice: () => {} });
  const db = drizzle(opts.instrument ? opts.instrument(sqlClient) : sqlClient, { schema });
  return { db, close: () => sqlClient.end({ timeout: 5 }) };
}

export type Db = ReturnType<typeof createDb>['db'];
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
