import 'server-only';
import { type EnvName, resolveEnvironment } from '@cs/db';
import { DEMO_OPERATOR_EMAIL } from '@cs/demo/users';
import { activeEnvName, processGuardOn, webRepoRoot } from './dev-guard';
import { webEnv } from './env';

export interface EnvUrls {
  owner: string;
  app: string;
  service: string;
}

/** DEV is exactly what the app used before (webEnv); DEMO and TEST come from `resolveEnvironment`. */
export function envUrls(name: EnvName): EnvUrls {
  if (name === 'dev') {
    const w = webEnv();
    return { owner: w.queueDatabaseUrl, app: w.appDatabaseUrl, service: w.serviceDatabaseUrl };
  }
  const r = resolveEnvironment(name, { repoRoot: webRepoRoot(), env: process.env });
  return { owner: r.ownerUrl, app: r.appUrl, service: r.serviceUrl };
}

export const envEvidenceDir = (name: 'demo' | 'test'): string => resolveEnvironment(name, { repoRoot: webRepoRoot(), env: process.env }).evidenceDir;

/** Spec §5.4: the demo operator joins PLATFORM_ADMIN_EMAILS in memory while the guard is on and DEMO or TEST is live. */
export function platformAdminsFor(base: readonly string[], name: EnvName, guardOn: boolean): string[] {
  return guardOn && name !== 'dev' && !base.includes(DEMO_OPERATOR_EMAIL) ? [...base, DEMO_OPERATOR_EMAIL] : [...base];
}

export const platformAdmins = (name: EnvName = activeEnvName()): string[] => platformAdminsFor(webEnv().platformAdmins, name, processGuardOn());
