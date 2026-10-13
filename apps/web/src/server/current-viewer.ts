import 'server-only';
import type { AccessContext } from '@cs/core';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { clientIdFromPath } from '@/components/shell/nav-items';
import { auth } from './auth';
import { dbs } from './db';
import { webEnv } from './env';
import { GUEST_COOKIE } from './guest';
import { platformAdmins } from './runtime-env';
import { safeNext } from './safe-next';
import { SUPPORT_COOKIE } from './support-cookie';
import { MEMBERSHIP_COOKIE, resolveSupportViewer, resolveViewer, type Viewer } from './viewer';

/** Where an unusable `rm_support` cookie is sent: Server Components can't clear cookies, the route handler can. */
export const SUPPORT_END_PATH = '/support/end';

/**
 * Review Focus 4: `cache()` scopes this to a single request only (React resets it between requests), so the
 * membership/AccessContext is always rebuilt from the database on the next request — never cached across requests.
 *
 * Decision 16 limitation: the clientHint comes from the `x-rm-path` header, set once per request by `proxy.ts`. A
 * later client-side navigation away from `/c/<id>` without a full page load keeps this cached viewer's membership
 * until the next full load (HANDOVER §6 L1).
 *
 * Phase 8b: modes `page` and `api` honour `rm_support` (spec "Session resolution"): signed-in user first (no user →
 * the cookie is ignored), then the cookie, then `resolveSession`. In `page` an unusable cookie redirects to
 * `/support/end?next=…&sid=<failed id>` (R4: no cookie writes during render). In `api` (POST routes, where a 307 to a
 * GET-only route would 405) it is treated as no support session and normal resolution follows; the next page load
 * clears it. `operator` never reads the cookie (R3, `/platform/**`).
 */
type Mode = 'page' | 'api' | 'operator';
async function viewerWith(clientHint: string | null, mode: Mode): Promise<Viewer | null> {
  const [h, jar] = [await headers(), await cookies()];
  const s = await auth().api.getSession({ headers: h });
  const session = s ? { userId: s.user.id, email: s.user.email, name: s.user.name } : null;
  const service = dbs().service;
  if (session && mode !== 'operator') {
    const sv = await resolveSupportViewer({ service, platformAdmins: platformAdmins(), session, supportCookie: jar.get(SUPPORT_COOKIE)?.value });
    if (sv?.kind === 'support') return sv;
    if (sv?.kind === 'end' && mode === 'page') {
      const sid = sv.sessionId ? `&sid=${sv.sessionId}` : '';
      redirect(`${SUPPORT_END_PATH}?next=${encodeURIComponent(safeNext(h.get('x-rm-path')))}${sid}`);
    }
  }
  return resolveViewer({
    service,
    session,
    membershipCookie: jar.get(MEMBERSHIP_COOKIE)?.value,
    guestCookie: jar.get(GUEST_COOKIE)?.value,
    linkSecrets: webEnv().linkSecrets,
    clientHint,
  });
}

const pathHint = async () => clientIdFromPath((await headers()).get('x-rm-path') ?? '');

export const getViewer = cache(async (): Promise<Viewer | null> => viewerWith(await pathHint(), 'page'));

/**
 * R3: the signed-in user's own (non-support) resolution; `rm_support` is never read. Never redirects (unlike
 * `requireOperatorContext`). The root layout themes `<html>` with it during a session (8b M1).
 */
export const getOperatorViewer = cache(async (): Promise<Viewer | null> => viewerWith(null, 'operator'));

/**
 * For API routes whose path names no client (`/api/ask/turn`): the client comes from the request body, so a user with
 * several single-client memberships acts under the one covering that client (Decision 16), as a `/c/<id>` page would.
 * The hint only picks among the user's own memberships; access is still checked by the caller.
 */
export async function getViewerForClient(clientId: string | null): Promise<Viewer | null> {
  return viewerWith(clientId, 'api');
}

async function signInRedirect(): Promise<never> {
  const path = safeNext((await headers()).get('x-rm-path'));
  redirect(`/sign-in?next=${encodeURIComponent(path)}`);
}

export async function requireViewer(): Promise<Viewer> {
  const v = await getViewer();
  if (!v) return signInRedirect();
  return v;
}

/** `/agency/*`, `/c/*` and shared pages: during a support session this is the synthetic support context. */
export async function requireContext(): Promise<{ viewer: Exclude<Viewer, { kind: 'member-less' }>; ctx: AccessContext }> {
  const v = await requireViewer();
  if (v.kind === 'member-less') redirect('/no-access');
  return { viewer: v, ctx: v.ctx };
}

/**
 * R3: every `/platform/**` page and action. The operator stays operator during a support session: their own
 * membership context, `rm_support` ignored. R7: like 8a, a member-less operator goes to `/no-access`.
 */
export async function requireOperatorContext(): Promise<{ viewer: Exclude<Viewer, { kind: 'member-less' | 'support' }>; ctx: AccessContext }> {
  const v = await getOperatorViewer();
  if (!v) return signInRedirect();
  if (v.kind === 'member-less' || v.kind === 'support') redirect('/no-access');
  return { viewer: v, ctx: v.ctx };
}
