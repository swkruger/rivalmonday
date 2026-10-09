import { readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { type EnvName, isEnvName } from '@cs/db';

/**
 * Spec §5.3 conditions 1 and 2 — process-level. The database/storage/auth factories switch on these alone
 * (deviation 6: they run outside any request). The banner and every panel route also need `requestGuardOn`.
 */
export function processGuardOn(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NODE_ENV !== 'production' && env.DEV_PANEL === '1';
}

/** Spec §5.3 condition 3: `localhost` or `127.0.0.1`, any port. Nothing else, not even `[::1]`. */
export function isLocalHost(host: string | null | undefined): boolean {
  if (!host) return false;
  const name = host.trim().toLowerCase().replace(/:\d+$/, '');
  return name === 'localhost' || name === '127.0.0.1';
}

export function requestGuardOn(host: string | null | undefined, env: NodeJS.ProcessEnv = process.env): boolean {
  return processGuardOn(env) && isLocalHost(host);
}

/** `next dev` runs with `apps/web` as its working directory. */
export const webRepoRoot = (cwd: string = process.cwd()): string => resolve(cwd, '..', '..');

/** `.dev-env.json` at the repo root (git-ignored); `RM_DEV_ENV_FILE` overrides it (the panel E2E uses its own file). */
export function devEnvFile(env: NodeJS.ProcessEnv = process.env, repoRoot: string = webRepoRoot()): string {
  const override = env.RM_DEV_ENV_FILE?.trim();
  return override ? resolve(override) : resolve(repoRoot, '.dev-env.json');
}

export function readDevEnv(file: string): EnvName | null {
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as { env?: unknown };
    return isEnvName(parsed.env) ? parsed.env : null;
  } catch {
    return null;
  }
}

export async function writeDevEnv(file: string, name: EnvName): Promise<void> {
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify({ env: name })}\n`, 'utf8');
}

/** The live database: DEV unless the process guard is on and `.dev-env.json` names another. */
export function activeEnvName(env: NodeJS.ProcessEnv = process.env): EnvName {
  if (!processGuardOn(env)) return 'dev';
  return readDevEnv(devEnvFile(env)) ?? 'dev';
}
