import { NextResponse } from 'next/server';
import { getViewer } from '@/server/current-viewer';
import { dbs } from '@/server/db';
import { webEnv } from '@/server/env';
import { goDestination } from '@/server/links';
import { safeNext } from '@/server/safe-next';

export const dynamic = 'force-dynamic';

/**
 * Spec §9.3 unsigned Slack/Teams webhook link, behind login — `/go/` is deliberately not in `proxy.ts`'s public
 * list, so an unauthenticated request already bounces to `/sign-in` there; this handler re-checks because a guest
 * cookie alone (no `kind: 'user'` viewer) must not resolve one either. The destination is found through
 * `withTenant`-scoped, RLS-visible rows only (`goDestination`), so a target from another agency or an
 * unknown/malformed id never leaks whether it exists — both come back 404.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ target: string; id: string }> }) {
  const { target, id } = await params;
  const env = webEnv();
  const viewer = await getViewer();
  if (!viewer || viewer.kind !== 'user') {
    const next = safeNext(`/go/${target}/${id}`);
    return NextResponse.redirect(new URL(`/sign-in?next=${encodeURIComponent(next)}`, env.appUrl));
  }
  const to = await goDestination(dbs().app, viewer.ctx, target, id);
  return to ? NextResponse.redirect(new URL(safeNext(to), env.appUrl)) : new NextResponse('Not found', { status: 404 });
}
