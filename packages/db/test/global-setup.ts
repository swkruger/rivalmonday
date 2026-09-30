import postgres from 'postgres';
import { runMigrations } from '../src/migrate';
import { testUrls } from './helpers';

export default async function setup(): Promise<void> {
  const sql = postgres(testUrls.owner, { max: 1, onnotice: () => {} });
  try {
    const [{ current_database: name }] = await sql<{ current_database: string }[]>`select current_database()`;
    if (!name.endsWith('_test')) {
      throw new Error(`Refusing to reset database "${name}": test database names must end with _test`);
    }
    await sql.unsafe('DROP SCHEMA IF EXISTS drizzle CASCADE; DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;');
  } finally {
    await sql.end();
  }
  await runMigrations(testUrls.owner);
}
