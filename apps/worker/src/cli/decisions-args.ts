import { parseArgs } from 'node:util';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const DECISIONS_USAGE = [
  'Usage: pnpm --filter @cs/worker decisions <command>',
  '  report  [--task <ai task>] [--since <YYYY-MM-DD>]      accuracy and calibration per task/family/provider',
  '  export  --out <file.csv> [--task <ai task>] [--limit <n samples, default 200>]   unlabelled questions to label',
  '  import  --in <file.csv> --by <your name>               load the filled-in label column',
  '  reviews [--limit <n, default 20>]                       open decision_review queue',
  '  resolve <review uuid> --by <name> --answer key=value [--answer key=value …]',
].join('\n');

export type DecisionsCommand =
  | { cmd: 'report'; task?: string; since?: Date }
  | { cmd: 'export'; out: string; task?: string; limit: number }
  | { cmd: 'import'; in: string; by: string }
  | { cmd: 'reviews'; limit: number }
  | { cmd: 'resolve'; reviewId: string; by: string; answers: Record<string, string | boolean> };

const fail = (msg: string) => ({ error: `${msg}\n${DECISIONS_USAGE}` });
const positiveInt = (v: string | undefined, fallback: number) => (v === undefined ? fallback : Number(v));

export function parseDecisionsArgs(argv: string[]): DecisionsCommand | { error: string } {
  const [cmd, ...rest] = argv;
  let values: Record<string, string | string[] | boolean | undefined>;
  let positionals: string[];
  try {
    ({ values, positionals } = parseArgs({
      args: rest, allowPositionals: true,
      options: {
        task: { type: 'string' }, since: { type: 'string' }, out: { type: 'string' }, in: { type: 'string' }, by: { type: 'string' },
        limit: { type: 'string' }, answer: { type: 'string', multiple: true },
      },
    }));
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err));
  }
  const str = (k: string) => values[k] as string | undefined;
  switch (cmd) {
    case 'report': {
      const since = str('since');
      if (since !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(since)) return fail(`--since must be YYYY-MM-DD (got "${since}")`);
      return { cmd, ...(str('task') ? { task: str('task') } : {}), ...(since ? { since: new Date(`${since}T00:00:00Z`) } : {}) };
    }
    case 'export': {
      const limit = positiveInt(str('limit'), 200);
      if (!str('out')) return fail('export needs --out <file.csv>');
      if (!Number.isInteger(limit) || limit < 1) return fail(`--limit must be a positive integer (got "${str('limit')}")`);
      return { cmd, out: str('out')!, ...(str('task') ? { task: str('task') } : {}), limit };
    }
    case 'import':
      if (!str('in') || !str('by')) return fail('import needs --in <file.csv> and --by <name>');
      return { cmd, in: str('in')!, by: str('by')! };
    case 'reviews': {
      const limit = positiveInt(str('limit'), 20);
      if (!Number.isInteger(limit) || limit < 1) return fail(`--limit must be a positive integer (got "${str('limit')}")`);
      return { cmd, limit };
    }
    case 'resolve': {
      const reviewId = positionals[0];
      if (!reviewId || !UUID.test(reviewId)) return fail(`resolve needs a review uuid (got "${reviewId ?? ''}")`);
      if (!str('by')) return fail('resolve needs --by <name>');
      const raw = (values.answer as string[] | undefined) ?? [];
      if (raw.length === 0) return fail('resolve needs at least one --answer key=value');
      const answers: Record<string, string | boolean> = {};
      for (const a of raw) {
        const i = a.indexOf('=');
        if (i <= 0 || i === a.length - 1) return fail(`--answer must be key=value (got "${a}")`);
        const v = a.slice(i + 1);
        answers[a.slice(0, i)] = v === 'true' ? true : v === 'false' ? false : v;
      }
      return { cmd, reviewId, by: str('by')!, answers };
    }
    default:
      return fail(cmd ? `unknown command "${cmd}"` : 'missing command');
  }
}
