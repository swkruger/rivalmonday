import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { AppShell } from '@/components/shell/app-shell';
import { NAV_CTX_COOKIE, parseNavCookie } from '@/components/shell/nav-context';
import { billingRedirectFor } from '@/server/billing-redirect';
import { billingSnapshotOf } from '@/server/billing-state';
import { requireContext } from '@/server/current-viewer';
import { runTool } from '@/server/run-tool';
import { callTool } from '@/server/tools';

export const dynamic = 'force-dynamic';

/**
 * `/agency/*`, `/c/*` and shared pages. During a support session this is the read-only support context (banner on).
 *
 * Phase 9a: one cheap billing read per full load. A suspended agency redirects (ruling R20, `billingRedirectFor`); the
 * `/paused` page itself renders without the shell, since none of the shell's links lead anywhere for those viewers. A
 * support session (operator) is never redirected. Like `x-rm-path` elsewhere, this runs on full loads only.
 *
 * 15a §2.1: the `rm_nav_ctx` cookie (last context) picks the menu on neutral pages (`/inbox`, `/kb/*`) for the first
 * render; the sidebar reads the live cookie after that and reads a remembered `platform` as `agency` here (P1).
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { viewer, ctx } = await requireContext();
  const billing = viewer.kind === 'support' ? null : await billingSnapshotOf(ctx.agencyId);
  const firstSession = viewer.kind === 'user' && ctx.role === 'agency_admin';
  const pathname = billing || firstSession ? ((await headers()).get('x-rm-path') ?? '').split('?')[0]! : '';
  if (billing) {
    const to = billingRedirectFor({ state: billing.state, role: ctx.role, pathname });
    if (to) redirect(to);
    if (billing.state === 'suspended' && ctx.role !== 'agency_admin') return <>{children}</>;
  }
  // Phase 10 first-session redirect: one status read, admins in a normal session only (never support, never `/onboarding`).
  // Legacy agencies are backfilled `completed`, so they are never sent. `redirected_at` makes it happen once.
  if (firstSession && billing?.state !== 'suspended' && !pathname.startsWith('/onboarding')) {
    const status = await callTool<{ completed: boolean; dismissed: boolean; redirected: boolean }>(ctx, 'get_onboarding_status', {});
    if (!status.completed && !status.dismissed && !status.redirected) {
      // Only when the mark stuck: otherwise every full load would redirect again. A failed mark falls through to the shell.
      const marked = await runTool(ctx, 'mark_onboarding_redirected', {});
      if (marked.ok) redirect('/onboarding');
    }
  }
  const fallback = parseNavCookie((await cookies()).get(NAV_CTX_COOKIE)?.value);
  return (
    <AppShell viewer={viewer} ctx={ctx} billing={billing} fallback={fallback}>
      {children}
    </AppShell>
  );
}
