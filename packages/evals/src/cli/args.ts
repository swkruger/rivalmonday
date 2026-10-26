import { parseArgs } from 'node:util';
import { SUITES, type Suite } from '../case';

export const EVAL_USAGE = [
  'Usage: pnpm --filter @cs/evals eval <command> --suite <changes|reviews|briefs|ask|all> [options]',
  '  build   --suite <changes|reviews>                rebuild cases (cs_dev via DATABASE_URL, read-only; golden; synthetic)',
  '  label   --suite <changes|reviews> (--export <file> | --import <file> --by <name> | --prelabel [--max-usd n])',
  '  run     --suite <s> [--mode replay|live] [--max-usd n] [--report-dir d] [--update-baseline]',
  '  record  --suite <s> [--fill] [--max-usd n] [--report-dir d]  live run that rewrites cassettes/<suite>.json;',
  '          --fill replays stored replies and calls live only on misses (cap counts live calls only)',
  '  --max-usd defaults to $EVAL_MAX_USD, else 5; live/record in CI (CI=true) refuse without one of them.',
].join('\n');

export const DEFAULT_MAX_USD = 5;
export const DEFAULT_REPORT_DIR = 'eval-report';

type Common = { suite: Suite | 'all' };
export type EvalCommand =
  | (Common & { cmd: 'build' })
  | (Common & { cmd: 'label'; export?: string; import?: string; by?: string; prelabel: boolean; maxUsd?: number })
  | (Common & { cmd: 'run'; mode: 'replay' | 'live'; maxUsd?: number; reportDir: string; updateBaseline: boolean })
  | (Common & { cmd: 'record'; maxUsd?: number; reportDir: string; fill?: true });

const fail = (msg: string) => ({ error: `${msg}\n${EVAL_USAGE}` });

export function parseEvalArgs(argv: string[]): EvalCommand | { error: string } {
  const [cmd, ...rest] = argv;
  let values: Record<string, string | boolean | undefined>;
  try {
    ({ values } = parseArgs({
      args: rest,
      allowPositionals: false,
      options: {
        suite: { type: 'string' }, mode: { type: 'string' }, 'max-usd': { type: 'string' }, 'report-dir': { type: 'string' },
        'update-baseline': { type: 'boolean' }, export: { type: 'string' }, import: { type: 'string' }, by: { type: 'string' }, prelabel: { type: 'boolean' },
        fill: { type: 'boolean' },
      },
    }));
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err));
  }
  const str = (k: string) => values[k] as string | undefined;
  if (cmd !== 'build' && cmd !== 'label' && cmd !== 'run' && cmd !== 'record') return fail(cmd ? `unknown command "${cmd}"` : 'missing command');
  const suite = str('suite');
  if (!suite) return fail(`${cmd} needs --suite <${SUITES.join('|')}|all>`);
  if (suite !== 'all' && !(SUITES as readonly string[]).includes(suite)) return fail(`unknown suite "${suite}"`);
  const s = suite as Suite | 'all';

  let maxUsd: number | undefined;
  if (str('max-usd') !== undefined) {
    maxUsd = Number(str('max-usd'));
    if (!Number.isFinite(maxUsd) || maxUsd <= 0) return fail(`--max-usd must be a positive number (got "${str('max-usd')}")`);
  }
  const reportDir = str('report-dir') ?? DEFAULT_REPORT_DIR;

  if (values.fill === true && cmd !== 'record') return fail('--fill only applies to record');
  if ((cmd === 'build' || cmd === 'label') && s !== 'changes' && s !== 'reviews') return fail(`${cmd} supports --suite changes|reviews only (briefs/ask cases are authored)`);

  switch (cmd) {
    case 'build':
      return { cmd, suite: s };
    case 'label': {
      const modes = [str('export') !== undefined, str('import') !== undefined, values.prelabel === true].filter(Boolean).length;
      if (modes !== 1) return fail('label needs exactly one of --export <file>, --import <file> --by <name>, --prelabel');
      if (str('import') !== undefined && !str('by')) return fail('--import needs --by <name>');
      if (str('by') && str('import') === undefined) return fail('--by only applies to --import');
      if (maxUsd !== undefined && values.prelabel !== true) return fail('--max-usd only applies to --prelabel');
      return {
        cmd, suite: s, prelabel: values.prelabel === true, ...(maxUsd !== undefined ? { maxUsd } : {}),
        ...(str('export') !== undefined ? { export: str('export') } : {}),
        ...(str('import') !== undefined ? { import: str('import'), by: str('by') } : {}),
      };
    }
    case 'run': {
      const mode = str('mode') ?? 'replay';
      if (mode !== 'replay' && mode !== 'live') return fail(`--mode must be replay or live (got "${mode}")`);
      const updateBaseline = values['update-baseline'] === true;
      if (updateBaseline && mode !== 'replay') return fail('--update-baseline is only allowed with --mode replay');
      return { cmd, suite: s, mode, reportDir, updateBaseline, ...(maxUsd !== undefined ? { maxUsd } : {}) };
    }
    case 'record':
      return { cmd, suite: s, reportDir, ...(maxUsd !== undefined ? { maxUsd } : {}), ...(values.fill === true ? { fill: true as const } : {}) };
  }
}

/** Cap resolution: --max-usd, else EVAL_MAX_USD, else 5. Live/record in CI must have one of the first two. */
export function resolveMaxUsd(flag: number | undefined, env: Record<string, string | undefined>, live: boolean): number | { error: string } {
  if (flag !== undefined) return flag;
  const raw = env.EVAL_MAX_USD?.trim();
  if (raw) {
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) return { error: `EVAL_MAX_USD must be a positive number (got "${raw}")` };
    return n;
  }
  if (live && env.CI === 'true') return { error: 'live runs in CI need --max-usd or EVAL_MAX_USD' };
  return DEFAULT_MAX_USD;
}
