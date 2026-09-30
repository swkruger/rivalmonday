import postgres from 'postgres';
import { runMigrations } from '../src/migrate';
import { testUrls } from './helpers';

export default async function setup(): Promise<void> {
  const sql = postgres(testUrls.owner, { max: 1, onnotice: () => {} });
  try {
    await sql.unsafe('DROP SCHEMA IF EXISTS drizzle CASCADE; DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;');
  } finally {
    await sql.end();
  }
  await runMigrations(testUrls.owner);
}
