import { parseArgs } from 'node:util';

export const RESCORE_USAGE = [
  'Usage: pnpm --filter @cs/worker rescore [--since-days N] [--client <uuid>] [--dry-run]',
  '  --since-days N     re-score events scored in the last N days (1-30, default 14)',
  '  --client <uuid>    one client only (default: all clients)',
  '  --dry-run          count what would change, write nothing',
].join('\n');

export type RescoreArgs = { sinceDays: number; clientId?: string; dryRun: boolean } | { error: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const fail = (msg: string) => ({ error: `${msg}\n${RESCORE_USAGE}` });

export function parseRescoreArgs(argv: string[]): RescoreArgs {
  let values: { 'since-days'?: string; client?: string; 'dry-run'?: boolean };
  try {
    values = parseArgs({
      args: argv,
      allowPositionals: false,
      options: { 'since-days': { type: 'string' }, client: { type: 'string' }, 'dry-run': { type: 'boolean', default: false } },
    }).values;
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err));
  }
  let sinceDays = 14;
  if (values['since-days'] !== undefined) {
    const raw = values['since-days'].trim();
    sinceDays = /^\d+$/.test(raw) ? Number(raw) : NaN;
    if (!Number.isInteger(sinceDays) || sinceDays < 1 || sinceDays > 30) return fail(`--since-days must be an integer 1-30, got "${values['since-days']}"`);
  }
  const dryRun = values['dry-run'] ?? false;
  if (values.client === undefined) return { sinceDays, dryRun };
  const clientId = values.client.trim().toLowerCase();
  if (!UUID.test(clientId)) return fail(`--client is not a uuid: "${values.client}"`);
  return { sinceDays, clientId, dryRun };
}
