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
