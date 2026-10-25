import { parseArgs } from 'node:util';

export const REHEARSAL_USAGE = [
  'Usage: pnpm --filter @cs/demo rehearsal <command> [options]',
  '  seed --agencies 40 --clients 3 --starting-points 12 --live-clients 10 --confirm-db <host>/<db>   (SERVICE_DATABASE_URL)',
  '  fault --clients 3 [--manifest f]                      before Thursday 22:00 local, seeded DB only (SERVICE_DATABASE_URL)',
  '  approve [--manifest f]                                Friday ~14:00 local (APP_DATABASE_URL + SERVICE_DATABASE_URL)',
  '  report [--manifest f] [--memory-mb n] [--fixture-log-url u --fixture-log-token-env NAME]   (DATABASE_URL, staging owner)',
  '  teardown --confirm-db <host>/<db> [--out f]           writes rehearsal-archive.sh (SERVICE_DATABASE_URL)',
  '  latency --out packages/engine/src/rehearsal-latency.json [--days 30]   reads cs_dev llm_call (DATABASE_URL)',
].join('\n');

export type RehearsalArgs =
  | { cmd: 'seed'; agencies: number; clients: number; startingPoints: number; liveClients: number; confirmDb: string; manifest?: string }
  | { cmd: 'fault'; clients: number; manifest?: string }
  | { cmd: 'approve'; manifest?: string }
  | { cmd: 'report'; manifest?: string; memoryMb?: number; fixtureLogUrl?: string; fixtureLogTokenEnv?: string }
  | { cmd: 'teardown'; confirmDb: string; out?: string }
  | { cmd: 'latency'; out: string; days?: number };

const fail = (msg: string) => ({ error: `${msg}\n${REHEARSAL_USAGE}` });

export function parseRehearsalArgs(argv: string[]): RehearsalArgs | { error: string } {
  let values: Record<string, string | undefined>;
  let positionals: string[];
  try {
    const parsed = parseArgs({
      args: argv, allowPositionals: true, strict: true,
      options: Object.fromEntries(['agencies', 'clients', 'starting-points', 'live-clients', 'confirm-db', 'manifest', 'memory-mb', 'fixture-log-url', 'fixture-log-token-env', 'out', 'days']
        .map((k) => [k, { type: 'string' as const }])),
    });
    values = parsed.values as Record<string, string | undefined>;
    positionals = parsed.positionals;
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err));
  }
  const [cmd, ...extra] = positionals;
  if (extra.length > 0) return fail(`unexpected argument "${extra[0]}"`);
  const num = (k: string, required: boolean): number | undefined | { error: string } => {
    const v = values[k];
    if (v === undefined) return required ? fail(`--${k} is required`) : undefined;
    const n = Number(v);
    return Number.isInteger(n) && n >= 0 ? n : fail(`--${k} must be a whole number`);
  };
  const isErr = (x: unknown): x is { error: string } => typeof x === 'object' && x !== null && 'error' in x;
  const allowed: Record<string, string[]> = {
    seed: ['agencies', 'clients', 'starting-points', 'live-clients', 'confirm-db', 'manifest'], fault: ['clients', 'manifest'], approve: ['manifest'],
    report: ['manifest', 'memory-mb', 'fixture-log-url', 'fixture-log-token-env'], teardown: ['confirm-db', 'out'], latency: ['out', 'days'],
  };
  if (!cmd || !allowed[cmd]) return fail(cmd ? `unknown command "${cmd}"` : 'missing command');
  const stray = Object.keys(values).filter((k) => values[k] !== undefined && !allowed[cmd]!.includes(k));
  if (stray.length > 0) return fail(`${cmd} does not take --${stray[0]}`);

  switch (cmd) {
    case 'seed': {
      const n = ['agencies', 'clients', 'starting-points', 'live-clients'].map((k) => num(k, true));
      const bad = n.find(isErr);
      if (bad) return bad;
      if (!values['confirm-db']) return fail('--confirm-db <host>/<db> is required');
      const [agencies, clients, startingPoints, liveClients] = n as number[];
      return { cmd, agencies: agencies!, clients: clients!, startingPoints: startingPoints!, liveClients: liveClients!, confirmDb: values['confirm-db'], manifest: values.manifest };
    }
    case 'fault': {
      const clients = num('clients', true);
      return isErr(clients) ? clients : { cmd, clients: clients!, manifest: values.manifest };
    }
    case 'approve':
      return { cmd, manifest: values.manifest };
    case 'report': {
      const memoryMb = num('memory-mb', false);
      if (isErr(memoryMb)) return memoryMb;
      if (Boolean(values['fixture-log-url']) !== Boolean(values['fixture-log-token-env'])) return fail('--fixture-log-url and --fixture-log-token-env go together');
      return { cmd, manifest: values.manifest, memoryMb, fixtureLogUrl: values['fixture-log-url'], fixtureLogTokenEnv: values['fixture-log-token-env'] };
    }
    case 'teardown':
      if (!values['confirm-db']) return fail('--confirm-db <host>/<db> is required');
      return { cmd, confirmDb: values['confirm-db'], out: values.out };
    default: {
      const days = num('days', false);
      if (isErr(days)) return days;
      if (!values.out) return fail('--out <file> is required');
      return { cmd: 'latency', out: values.out, days };
    }
  }
}
