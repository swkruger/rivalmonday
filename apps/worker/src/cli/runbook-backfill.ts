import { fileURLToPath } from 'node:url';

try {
  process.loadEnvFile(fileURLToPath(new URL('../../../../.env', import.meta.url)));
} catch {
  // repo-root .env is optional (e.g. production, where env vars are injected directly)
}

const { catalogRows, createDb } = await import('@cs/db');
const { createCatalog } = await import('@cs/verticals');
const { runRunbookBackfill } = await import('./runbook-backfill-run');

const dryRun = process.argv.slice(2).includes('--dry-run');
const url = process.env.SERVICE_DATABASE_URL;
if (!url) {
  console.error('SERVICE_DATABASE_URL is required');
  process.exit(1);
}
const { db, close } = createDb(url);
let code = 0;
try {
  const catalog = createCatalog(() => catalogRows(db), { ttlMs: 60_000 });
  const c = await runRunbookBackfill({ db, packs: catalog.packs, generic: () => catalog.generic() }, { dryRun });
  console.log(`${dryRun ? 'Would create' : 'Created'}: platform runbook ${c.platformCreated ? 1 : 0}, agency runbooks ${c.agenciesCreated}, client runbooks ${c.clientsCreated}`);
} catch (e) {
  console.error('runbook:backfill failed:', e instanceof Error ? e.message : 'Error');
  code = 1;
} finally {
  await close();
}
process.exit(code);
