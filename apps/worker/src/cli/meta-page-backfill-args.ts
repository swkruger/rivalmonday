import { parseArgs } from 'node:util';

export const META_PAGE_BACKFILL_USAGE = [
  'Usage: pnpm --filter @cs/worker meta-page-backfill [--competitor <uuid>] [--dry-run]',
  '  --competitor <uuid>  one competitor only (default: all)',
  '  --dry-run            count what would be written, write nothing',
].join('\n');

export type MetaPageBackfillArgs = { competitorId?: string; dryRun: boolean } | { error: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const fail = (msg: string) => ({ error: `${msg}\n${META_PAGE_BACKFILL_USAGE}` });

export function parseMetaPageBackfillArgs(argv: string[]): MetaPageBackfillArgs {
  let values: { competitor?: string; 'dry-run'?: boolean };
  try {
    values = parseArgs({ args: argv, allowPositionals: false, options: { competitor: { type: 'string' }, 'dry-run': { type: 'boolean', default: false } } }).values;
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err));
  }
  const dryRun = values['dry-run'] ?? false;
  if (values.competitor === undefined) return { dryRun };
  const competitorId = values.competitor.trim().toLowerCase();
  if (!UUID.test(competitorId)) return fail(`--competitor is not a uuid: "${values.competitor}"`);
  return { competitorId, dryRun };
}
