import { fileURLToPath } from 'node:url';
import { runMigrations } from '../migrate';

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
await runMigrations(url);
console.log('Migrations applied');
