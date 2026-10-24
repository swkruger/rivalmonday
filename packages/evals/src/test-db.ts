import { databaseNameOf } from '@cs/db';
import setup from '@cs/db/test-global-setup';
import { testUrls } from '@cs/db/test-helpers';

/** Throws unless every URL's database name ends `_test` (eval Ask runs truncate and seed the DB). */
export function assertTestDbUrls(urls: { owner: string; app: string; service: string }): void {
  for (const [role, url] of Object.entries(urls)) {
    const name = databaseNameOf(url);
    if (!name.endsWith('_test')) throw new Error(`Refusing to use database "${name}" (${role} URL): eval runs need a database whose name ends _test`);
  }
}

/** Refuses unless the owner, app and service test URLs all end `_test`, then runs @cs/db's global-setup (migrate when needed, empty the tables). */
export async function prepareTestDb(): Promise<void> {
  assertTestDbUrls(testUrls);
  await setup();
}
