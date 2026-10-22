import { parseArgs } from 'node:util';

/** Spec D16: purging sooner than this after archiving is refused (the operator's undo window). */
export const MIN_PURGE_DAYS = 30;

export const PURGE_USAGE = [
  'Usage: pnpm --filter @cs/worker purge-archived --older-than <n>d [--dry-run]',
  `  --older-than 90d   purge agencies/clients archived more than n days ago (n >= ${MIN_PURGE_DAYS})`,
  '  --dry-run          print the counts only; change nothing',
].join('\n');

export type PurgeArgs = { olderThanDays: number; dryRun: boolean } | { error: string };

const fail = (msg: string) => ({ error: `${msg}\n${PURGE_USAGE}` });

export function parsePurgeArgs(argv: string[]): PurgeArgs {
  let olderThan: string | undefined;
  let dryRun: boolean;
  try {
    const parsed = parseArgs({ args: argv, allowPositionals: false, options: { 'older-than': { type: 'string' }, 'dry-run': { type: 'boolean', default: false } } });
    olderThan = parsed.values['older-than'];
    dryRun = parsed.values['dry-run'] ?? false;
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err));
  }
  if (olderThan === undefined) return fail('--older-than is required');
  const m = /^(\d+)d$/.exec(olderThan.trim());
  if (!m) return fail(`--older-than must look like 90d (got "${olderThan}")`);
  const olderThanDays = Number(m[1]);
  if (olderThanDays < MIN_PURGE_DAYS) return fail(`--older-than must be at least ${MIN_PURGE_DAYS} days (got ${olderThanDays})`);
  return { olderThanDays, dryRun };
}
