import { databaseNameOf } from '../src/environments';
import { prepareTestDatabase } from '../src/reset';
import { testUrls } from './helpers';

/** Test databases must end with `_test`; the reset itself then demands that exact name (spec §7). */
export default async function setup(): Promise<void> {
  const name = databaseNameOf(testUrls.owner);
  if (!name.endsWith('_test')) {
    throw new Error(`Refusing to reset database "${name}": test database names must end with _test`);
  }
  // Rebuilds only when the migrations changed (or TEST_DB_FULL_RESET=1); otherwise empties the tables (~1 s vs ~1 min).
  await prepareTestDatabase(testUrls.owner, name);
}
