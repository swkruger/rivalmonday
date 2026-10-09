import type { Db } from '@cs/db';
import { truncateAll } from '@cs/db/test-helpers';
import { type SQL, sql } from 'drizzle-orm';

export const TEST_SALT = 'demo-test-salt-'.repeat(3);

/** Empty every public table and every Better Auth table (the demo seed refuses a non-empty database). */
export async function resetDemoTables(owner: Db): Promise<void> {
  await truncateAll(owner);
  await owner.execute(sql`truncate auth."user", auth.verification, auth."rateLimit" cascade`);
}

export async function countRows(db: Db, query: SQL): Promise<number> {
  const [row] = [...(await db.execute<{ n: number }>(query))];
  return Number(row?.n ?? 0);
}
