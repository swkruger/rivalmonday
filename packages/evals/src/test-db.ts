import { databaseNameOf } from '@cs/db';
import setup from '@cs/db/test-global-setup';
import { testUrls } from '@cs/db/test-helpers';

/** Throws unless the database name ends `_test` (eval Ask runs truncate and seed the DB). */
export function assertTestDbName(url: string): void {
  const name = databaseNameOf(url);
  if (!name.endsWith('_test')) throw new Error(`Refusing to use database "${name}": eval runs need a database whose name ends _test`);
}

/** Refuses non-_test names, then runs @cs/db's vitest global-setup (migrate when needed, empty the tables). */
export async function prepareTestDb(ownerUrl: string = testUrls.owner): Promise<void> {
  assertTestDbName(ownerUrl);
  await setup();
}
