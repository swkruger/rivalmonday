import { parseArgs } from 'node:util';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const ENGINE_ONCE_USAGE =
  'Usage: pnpm --filter @cs/worker engine-once [--competitor <uuid>] [--client <uuid>] [--rounds <1-1000>] [--moves] [--insights]';

/** Validates engine-once's flags up front (3a carry-over: bad input used to fail deep inside the engine). */
export function parseEngineArgs(argv: string[]): { competitor?: string; client?: string; rounds: number; moves: boolean; insights: boolean } | { error: string } {
  let values: { competitor?: string; client?: string; rounds?: string; moves?: boolean; insights?: boolean };
  try {
    ({ values } = parseArgs({
      args: argv,
      options: {
        competitor: { type: 'string' }, client: { type: 'string' }, rounds: { type: 'string', default: '10' },
        moves: { type: 'boolean', default: false }, insights: { type: 'boolean', default: false },
      },
    }));
  } catch (err) {
    return { error: `${err instanceof Error ? err.message : String(err)}\n${ENGINE_ONCE_USAGE}` };
  }
  for (const flag of ['competitor', 'client'] as const) {
    const v = values[flag];
    if (v !== undefined && !UUID.test(v)) return { error: `--${flag} must be a uuid (got "${v}")\n${ENGINE_ONCE_USAGE}` };
  }
  const rounds = Number(values.rounds);
  if (!Number.isInteger(rounds) || rounds < 1 || rounds > 1000) return { error: `--rounds must be an integer from 1 to 1000 (got "${values.rounds}")\n${ENGINE_ONCE_USAGE}` };
  return {
    ...(values.competitor ? { competitor: values.competitor } : {}), ...(values.client ? { client: values.client } : {}),
    rounds, moves: values.moves ?? false, insights: values.insights ?? false,
  };
}
