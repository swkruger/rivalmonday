import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

export function createDb(url: string) {
  const sqlClient = postgres(url, { max: 5, onnotice: () => {} });
  const db = drizzle(sqlClient, { schema });
  return { db, close: () => sqlClient.end({ timeout: 5 }) };
}

export type Db = ReturnType<typeof createDb>['db'];
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
