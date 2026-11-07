import { fileURLToPath } from 'node:url';

try {
  process.loadEnvFile(fileURLToPath(new URL('../../../../.env', import.meta.url)));
} catch {
  // repo-root .env is optional (e.g. production, where env vars are injected directly)
}

const { catalogRows, createDb } = await import('@cs/db');
const { createCatalog } = await import('@cs/verticals');
const { rescoreRecent } = await import('@cs/engine');
const { parseRescoreArgs } = await import('./rescore-args');

const args = parseRescoreArgs(process.argv.slice(2));
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
  const catalog = createCatalog(() => catalogRows(db), { ttlMs: 60_000 });
  const r = await rescoreRecent({ db, packs: catalog.packs, generic: () => catalog.generic() }, args);
  console.log(`Rescore (${args.dryRun ? 'dry run' : 'applied'}): last ${args.sinceDays} days, ${args.clientId ?? 'all clients'}`);
  console.log(`considered ${r.considered}, rescored ${r.rescored}, capped ${r.capped}, skipped featured ${r.skipped.featured} / alerted ${r.skipped.alerted} / current ${r.skipped.current}`);
  for (const [t, n] of Object.entries(r.transitions).sort(([a], [b]) => a.localeCompare(b))) console.log(`${t}: ${n}`);
} catch (e) {
  console.error('rescore failed:', e instanceof Error ? e.message : 'Error');
  code = 1;
} finally {
  await close();
}
process.exit(code);
