import 'server-only';
import { headers } from 'next/headers';
import { activeEnvName, requestGuardOn } from '@/server/dev-guard';
import { DevBanner } from './banner';

/** Spec 5.1/5.3: the strip on every page, or nothing when any guard condition fails. Raw `Host` only (ruling 1). */
export async function devBanner(): Promise<React.ReactNode> {
  if (!requestGuardOn((await headers()).get('host'))) return null;
  return <DevBanner env={activeEnvName()} />;
}
