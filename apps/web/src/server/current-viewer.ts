import 'server-only';
import type { AccessContext } from '@cs/core';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { auth } from './auth';
import { dbs } from './db';
import { webEnv } from './env';
import { GUEST_COOKIE } from './guest';
import { safeNext } from './safe-next';
import { MEMBERSHIP_COOKIE, resolveViewer, type Viewer } from './viewer';

/**
 * Review Focus 4: `cache()` scopes this to a single request only (React resets it between requests), so the
 * membership/AccessContext is always rebuilt from the database on the next request — never cached across requests.
 */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const [h, jar] = [await headers(), await cookies()];
  const s = await auth().api.getSession({ headers: h });
  return resolveViewer({
    service: dbs().service,
    session: s ? { userId: s.user.id, email: s.user.email, name: s.user.name } : null,
    membershipCookie: jar.get(MEMBERSHIP_COOKIE)?.value,
    guestCookie: jar.get(GUEST_COOKIE)?.value,
    linkSecrets: webEnv().linkSecrets,
  });
});

export async function requireViewer(): Promise<Viewer> {
  const v = await getViewer();
  if (!v) {
    const path = safeNext((await headers()).get('x-rm-path'));
    redirect(`/sign-in?next=${encodeURIComponent(path)}`);
  }
  return v;
}

export async function requireContext(): Promise<{ viewer: Exclude<Viewer, { kind: 'member-less' }>; ctx: AccessContext }> {
  const v = await requireViewer();
  if (v.kind === 'member-less') redirect('/no-access');
  return { viewer: v, ctx: v.ctx };
}
