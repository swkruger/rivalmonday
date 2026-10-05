import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { createDb } from './client';

// Not `new URL('../migrations', import.meta.url)`: bundlers (Turbopack/webpack) pattern-match that
// literal form and try to resolve/copy '../migrations' as a module/asset, which fails since it's a
// plain directory of .sql files read at runtime, not a bundlable resource.
export const MIGRATIONS_FOLDER = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

export async function runMigrations(url: string): Promise<void> {
  const { db, close } = createDb(url);
  try {
    await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  } finally {
    await close();
  }
}
