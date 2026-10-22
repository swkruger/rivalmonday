import { fileURLToPath } from 'node:url';

try {
  process.loadEnvFile(fileURLToPath(new URL('../../../../.env', import.meta.url)));
} catch {
  // optional
}

const { createDb } = await import('@cs/db');
const { parsePurgeArgs } = await import('./purge-args');
const { purgeArchived } = await import('../purge');

const args = parsePurgeArgs(process.argv.slice(2));
if ('error' in args) {
  console.error(args.error);
  process.exit(1);
}
// Service role: archived rows are invisible to app_user; purge deletes tenants and anonymises audit_log.
const url = process.env.SERVICE_DATABASE_URL;
if (!url) {
  console.error('SERVICE_DATABASE_URL is required');
  process.exit(1);
}

const { db, close } = createDb(url);
let code = 0;
try {
  const c = await purgeArchived(db, args);
  const verb = args.dryRun ? 'Would purge' : 'Purged';
  console.log(`${verb} ${c.agencies} agencies and ${c.clients} clients archived more than ${args.olderThanDays} days ago; ${c.auditAnonymised} audit_log rows ${args.dryRun ? 'would be ' : ''}anonymised.`);
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  code = 1;
} finally {
  await close();
}
process.exit(code);
