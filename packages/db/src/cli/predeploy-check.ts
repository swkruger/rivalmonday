import { fileURLToPath } from 'node:url';
import { createDb } from '../client';
import { findPredeployProblems } from '../predeploy';

try {
  process.loadEnvFile(fileURLToPath(new URL('../../../../.env', import.meta.url)));
} catch {
  // repo-root .env is optional (e.g. CI, where env vars are injected directly)
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}
const { db, close } = createDb(url);
let problems: string[];
try {
  problems = await findPredeployProblems(db);
} finally {
  await close();
}
if (problems.length > 0) {
  for (const p of problems) console.error(`predeploy: ${p}`);
  process.exit(1);
}
console.log('predeploy: safe to migrate');
