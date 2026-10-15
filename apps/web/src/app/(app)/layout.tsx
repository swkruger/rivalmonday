import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { AppShell } from '@/components/shell/app-shell';
import { billingRedirectFor } from '@/server/billing-redirect';
import { billingSnapshotOf } from '@/server/billing-state';
import { requireContext } from '@/server/current-viewer';

export const dynamic = 'force-dynamic';

/**
 * `/agency/*`, `/c/*` and shared pages. During a support session this is the read-only support context (banner on).
 *
 * Phase 9a: one cheap billing read per full load. A suspended agency redirects (ruling R20, `billingRedirectFor`); the
 * `/paused` page itself renders without the shell, since none of the shell's links lead anywhere for those viewers. A
 * support session (operator) is never redirected. Like `x-rm-path` elsewhere, this runs on full loads only.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { viewer, ctx } = await requireContext();
  const billing = viewer.kind === 'support' ? null : await billingSnapshotOf(ctx.agencyId);
  if (billing) {
    const pathname = ((await headers()).get('x-rm-path') ?? '').split('?')[0]!;
    const to = billingRedirectFor({ state: billing.state, role: ctx.role, pathname });
    if (to) redirect(to);
    if (billing.state === 'suspended' && ctx.role !== 'agency_admin') return <>{children}</>;
  }
  return (
    <AppShell viewer={viewer} ctx={ctx} billing={billing}>
      {children}
    </AppShell>
  );
}
