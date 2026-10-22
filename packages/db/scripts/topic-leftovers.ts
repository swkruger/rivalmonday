import { fileURLToPath } from 'node:url';
import { createDb } from '../src/client';
import { findTopicLeftovers } from '../src/topic-leftovers';

try {
  process.loadEnvFile(fileURLToPath(new URL('../../../.env', import.meta.url)));
} catch {
  // repo-root .env is optional (e.g. CI, where env vars are injected directly)
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}
const { db, close } = createDb(url);
const found = await findTopicLeftovers(db);
await close();
for (const f of found) console.log(`${f.table}.${f.column}: ${f.rows} row(s)`);
process.exit(found.length ? 1 : 0);
