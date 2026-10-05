import 'server-only';
import { agency, type Db } from '@cs/db';
import { type Branding, resolveBranding } from '@cs/email';
import { eq } from 'drizzle-orm';
import type { WebEnv } from './env';

/** Decision 12: the host's agency before sign-in (single host in MVP), else Rival Monday defaults. */
export async function defaultBranding(service: Db, env: WebEnv): Promise<Branding> {
  if (env.defaultAgencyId) {
    const [a] = await service.select({ name: agency.name, branding: agency.branding }).from(agency).where(eq(agency.id, env.defaultAgencyId));
    if (a) return resolveBranding(a.name, a.branding ?? null);
  }
  return resolveBranding('Rival Monday', null);
}
