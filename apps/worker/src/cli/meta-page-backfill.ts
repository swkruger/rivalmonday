import { fileURLToPath } from 'node:url';

try {
  process.loadEnvFile(fileURLToPath(new URL('../../../../.env', import.meta.url)));
} catch {
  // repo-root .env is optional (e.g. production, where env vars are injected directly)
}

const { createDb } = await import('@cs/db');
const { backfillMetaPageObservations } = await import('@cs/collectors');
const { createStoreFromEnv } = await import('@cs/storage');
const { parseMetaPageBackfillArgs } = await import('./meta-page-backfill-args');

const args = parseMetaPageBackfillArgs(process.argv.slice(2));
if ('error' in args) {
  console.error(args.error);
  process.exit(1);
}
const url = process.env.SERVICE_DATABASE_URL;
if (!url) {
  console.error('SERVICE_DATABASE_URL is required');
  process.exit(1);
}
const { db, close } = createDb(url);
let code = 0;
try {
  const r = await backfillMetaPageObservations({ db, store: createStoreFromEnv(process.env) }, args);
  console.log(`Meta page backfill (${args.dryRun ? 'dry run' : 'applied'}): ${args.competitorId ?? 'all competitors'}`);
  console.log(JSON.stringify(r));
} catch (e) {
  console.error('meta-page-backfill failed:', e instanceof Error ? e.message : 'Error');
  code = 1;
} finally {
  await close();
}
process.exit(code);
