import { fileURLToPath } from 'node:url';

try {
  process.loadEnvFile(fileURLToPath(new URL('../../../../.env', import.meta.url)));
} catch {
  // optional
}

const { createDb } = await import('@cs/db');
const { parseArchiveArgs } = await import('./archive-args');
const { archiveTenant } = await import('../purge');

const args = parseArchiveArgs(process.argv.slice(2));
if ('error' in args) {
  console.error(args.error);
  process.exit(1);
}
// Service role: archived_at is service-role only (migration 0082) and archived rows are invisible to app_user.
const url = process.env.SERVICE_DATABASE_URL;
if (!url) {
  console.error('SERVICE_DATABASE_URL is required');
  process.exit(1);
}

const { db, close } = createDb(url);
let code = 0;
try {
  const r = await archiveTenant(db, args);
  if ('error' in r) {
    console.error(r.message);
    code = 1;
  } else console.log(args.undo ? `Unarchived ${args.kind} ${args.id}.` : `Archived ${args.kind} ${args.id}. Undo with --undo; purge-archived deletes it after the grace period.`);
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  code = 1;
} finally {
  await close();
}
process.exit(code);
