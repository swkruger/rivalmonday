import { isAbsolute, join, resolve } from 'node:path';

/** Demo/dev-panel spec §3: the three local databases. */
export const ENV_NAMES = ['dev', 'demo', 'test'] as const;
export type EnvName = (typeof ENV_NAMES)[number];
export const isEnvName = (v: unknown): v is EnvName => typeof v === 'string' && (ENV_NAMES as readonly string[]).includes(v);

export const DEV_DATABASE = 'cs_dev';
export const DEMO_DATABASE = 'cs_demo';

export interface ResolvedEnvironment {
  name: EnvName;
  ownerUrl: string;
  appUrl: string;
  serviceUrl: string;
  /** Absolute directory of the filesystem evidence store for this database. */
  evidenceDir: string;
}

const NAME = /^[A-Za-z_][A-Za-z0-9_]{0,62}$/;

/** The database name in a postgres URL. Errors never include the URL: it carries a password. */
export function databaseNameOf(url: string): string {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new Error('Malformed database URL');
  }
  if (u.protocol !== 'postgres:' && u.protocol !== 'postgresql:') throw new Error('Malformed database URL: not a postgres URL');
  const name = decodeURIComponent(u.pathname.replace(/^\//, ''));
  if (!NAME.test(name)) throw new Error('Malformed database URL: no plain database name in the path');
  return name;
}

/** Spec §3: every destructive step names the exact database it may touch. */
export function assertDatabase(url: string, expected: string): void {
  const name = databaseNameOf(url);
  if (name !== expected) throw new Error(`Refusing to touch database "${name}": expected exactly "${expected}"`);
}

/** The same server, roles and query parameters, a different database. */
export function withDatabase(url: string, name: string): string {
  databaseNameOf(url);
  if (!NAME.test(name)) throw new Error(`Invalid database name "${name}"`);
  const u = new URL(url);
  u.pathname = `/${name}`;
  return u.toString();
}

function need(env: NodeJS.ProcessEnv, key: string): string {
  const v = env[key]?.trim();
  if (!v) throw new Error(`${key} is required`);
  return v;
}

function demoFrom(env: NodeJS.ProcessEnv, key: string): string {
  const url = need(env, key);
  if (databaseNameOf(url) !== DEV_DATABASE) throw new Error(`${key} must name ${DEV_DATABASE} to derive ${DEMO_DATABASE} (it names "${databaseNameOf(url)}")`);
  return withDatabase(url, DEMO_DATABASE);
}

/** Spec §3: the one function that knows where each environment's databases and evidence live. */
export function resolveEnvironment(name: EnvName, opts: { repoRoot: string; env?: NodeJS.ProcessEnv }): ResolvedEnvironment {
  const env = opts.env ?? process.env;
  const worker = join(opts.repoRoot, 'apps', 'worker');
  if (name === 'dev') {
    const dir = env.EVIDENCE_FS_DIR?.trim();
    return {
      name, ownerUrl: need(env, 'DATABASE_URL'), appUrl: need(env, 'APP_DATABASE_URL'), serviceUrl: need(env, 'SERVICE_DATABASE_URL'),
      // Same rule as resolveEvidenceDir in apps/web/src/server/files.ts (a package cannot import from apps/web): keep the two in sync.
      evidenceDir: dir ? (isAbsolute(dir) ? resolve(dir) : resolve(worker, dir)) : join(worker, '.evidence'),
    };
  }
  if (name === 'demo') {
    return {
      name, ownerUrl: demoFrom(env, 'DATABASE_URL'), appUrl: demoFrom(env, 'APP_DATABASE_URL'), serviceUrl: demoFrom(env, 'SERVICE_DATABASE_URL'),
      evidenceDir: join(worker, '.evidence-demo'),
    };
  }
  return {
    name, ownerUrl: need(env, 'TEST_DATABASE_URL'), appUrl: need(env, 'TEST_APP_DATABASE_URL'), serviceUrl: need(env, 'TEST_SERVICE_DATABASE_URL'),
    evidenceDir: join(opts.repoRoot, 'apps', 'web', 'test-results', 'evidence'),
  };
}
