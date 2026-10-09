import { signLink } from '@cs/core';
import { contact, type Db } from '@cs/db';
import { and, eq, isNotNull, like } from 'drizzle-orm';
import { DEMO_DOMAIN, DEMO_USERS, type DemoUserKey } from './users';

export * from './users';

/** Deviation 4: links open the guarded dev-panel sign-in route, never `/l/`. */
export const DEMO_SIGN_IN_PATH = '/dev-panel/sign-in';

export interface DemoLink {
  key: DemoUserKey;
  label: string;
  email: string;
  url: string;
}

/** Spec §5.2: one signed link per demo user that exists in `service`'s database, in DEMO_USERS order. */
export async function demoSignInLinks(service: Db, opts: { secret: string; baseUrl: string; now?: Date }): Promise<DemoLink[]> {
  const rows = await service
    .select({ id: contact.id, email: contact.email, agencyId: contact.agencyId, clientId: contact.clientId })
    .from(contact)
    .where(and(like(contact.email, `%@${DEMO_DOMAIN}`), isNotNull(contact.userId), eq(contact.active, true)));
  const base = opts.baseUrl.replace(/\/+$/, '');
  const out: DemoLink[] = [];
  for (const u of DEMO_USERS) {
    const c = rows.find((r) => r.email.toLowerCase() === u.email);
    if (!c) continue;
    const token = signLink(opts.secret, { sub: c.id, agency: c.agencyId, client: c.clientId ?? c.agencyId, t: 'notifications', id: c.id }, opts.now);
    out.push({ key: u.key, label: u.label, email: u.email, url: `${base}${DEMO_SIGN_IN_PATH}/${token}` });
  }
  return out;
}
