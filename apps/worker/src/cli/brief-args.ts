import { parseArgs } from 'node:util';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const BRIEF_ONCE_USAGE = 'Usage: pnpm --filter @cs/worker brief-once --client <uuid> [--now <ISO time>] [--force]';

export function parseBriefArgs(argv: string[]): { client: string; now?: Date; force: boolean } | { error: string } {
  let values: { client?: string; now?: string; force?: boolean };
  try {
    ({ values } = parseArgs({ args: argv, options: { client: { type: 'string' }, now: { type: 'string' }, force: { type: 'boolean', default: false } } }));
  } catch (err) {
    return { error: `${err instanceof Error ? err.message : String(err)}\n${BRIEF_ONCE_USAGE}` };
  }
  if (!values.client) return { error: `--client is required\n${BRIEF_ONCE_USAGE}` };
  if (!UUID.test(values.client)) return { error: `--client must be a uuid (got "${values.client}")\n${BRIEF_ONCE_USAGE}` };
  let now: Date | undefined;
  if (values.now !== undefined) {
    now = new Date(values.now);
    if (Number.isNaN(now.getTime())) return { error: `--now must be an ISO time (got "${values.now}")\n${BRIEF_ONCE_USAGE}` };
  }
  return { client: values.client, ...(now ? { now } : {}), force: values.force ?? false };
}
