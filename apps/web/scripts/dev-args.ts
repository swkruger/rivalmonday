import { type EnvName, isEnvName } from '@cs/db';

/** `--env <dev|demo|test>` is ours; everything else goes to `next dev`. */
export function parseDevArgs(argv: string[]): { env: EnvName | null; rest: string[] } {
  const rest: string[] = [];
  let env: EnvName | null = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--env') {
      const v = argv[++i];
      if (!isEnvName(v)) throw new Error('--env must be dev, demo or test');
      env = v;
    } else {
      rest.push(argv[i]!);
    }
  }
  return { env, rest };
}

/**
 * Review Focus 2: `next dev` listens on 0.0.0.0 by default, so a LAN client could forge `Host: localhost`. Bind to
 * 127.0.0.1 unless the caller chose a hostname with `-H` or `--hostname`.
 */
export function withLocalHostname(args: string[]): string[] {
  const chosen = args.some((a) => a === '-H' || a === '--hostname' || a.startsWith('-H=') || a.startsWith('--hostname='));
  return chosen ? args : [...args, '-H', '127.0.0.1'];
}
