import { fileURLToPath } from 'node:url';

try {
  process.loadEnvFile(fileURLToPath(new URL('../../../../.env', import.meta.url)));
} catch {
  // repo-root .env is optional (e.g. production, where env vars are injected directly)
}

const { createDb } = await import('@cs/db');
const { seedKnowledge } = await import('@cs/tools');

const serviceUrl = process.env.SERVICE_DATABASE_URL;
if (!serviceUrl) {
  console.error('SERVICE_DATABASE_URL is required');
  process.exit(1);
}

const { db, close } = createDb(serviceUrl);
try {
  const r = await seedKnowledge(db, fileURLToPath(new URL('../../../../docs/help', import.meta.url)));
  console.log(`[kb-seed] created ${r.created}, updated ${r.updated}, removed ${r.removed}, unchanged ${r.unchanged}`);
} catch (e) {
  console.error(`[kb-seed] failed: ${e instanceof Error ? e.message : String(e)}`);
  process.exitCode = 1;
} finally {
  await close();
}
