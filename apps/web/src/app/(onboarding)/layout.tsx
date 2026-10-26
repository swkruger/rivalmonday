import { isAgencyRole, viewerAudience } from '@cs/core';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { ShellNotices, ShellProviders } from '@/components/shell/shell-providers';
import { billingRedirectFor } from '@/server/billing-redirect';
import { billingSnapshotOf } from '@/server/billing-state';
import { requireContext } from '@/server/current-viewer';
import { helpAgencyName } from '@/server/help';
import { themeForViewer } from '@/server/theme';
import { callTool } from '@/server/tools';

export const dynamic = 'force-dynamic';

/**
 * 16 P1: the full-page split flows (agency onboarding, client setup). No `AppShell` — the pages draw their own
 * `OnboardingShell` — but the same session rules as `(app)/layout.tsx`: a suspended agency is redirected (R20) or, for a
 * non-admin role, gets bare children; read-only mode (support session, platform hold), help, timezone cookie and the
 * support, spend and billing banners come from the shared `ShellProviders`. Unlike `(app)`, no first-session redirect
 * (this group is where that redirect lands).
 */
export default async function OnboardingLayout({ children }: { children: React.ReactNode }) {
  const { viewer, ctx } = await requireContext();
  const billing = viewer.kind === 'support' ? null : await billingSnapshotOf(ctx.agencyId);
  if (billing) {
    const pathname = ((await headers()).get('x-rm-path') ?? '').split('?')[0]!;
    const to = billingRedirectFor({ state: billing.state, role: ctx.role, pathname });
    if (to) redirect(to);
    if (billing.state === 'suspended' && ctx.role !== 'agency_admin') return <>{children}</>;
  }
  const { branding, style, assistantName } = await themeForViewer(viewer);
  const support = viewer.kind === 'support' ? viewer.session : null;
  const singleClientId = ctx.clientScope === 'all' ? null : ctx.clientScope[0];
  const clientName = !isAgencyRole(ctx.role) && viewer.kind === 'user' ? viewer.membership.clientName : null;
  const spendAudience = ctx.role === 'agency_admin' ? 'agency' : ctx.role === 'client_owner' || ctx.role === 'client_viewer' ? 'client' : null;
  const spendPaused =
    spendAudience && (spendAudience === 'agency' || singleClientId)
      ? await callTool<{ paused: { clientId: string; name: string; until: string }[] }>(ctx, 'get_spend_status', spendAudience === 'agency' ? {} : { clientId: singleClientId }).then((r) => r.paused ?? [], () => [])
      : [];
  const help = {
    audience: viewerAudience(viewer.kind === 'guest' ? 'guest' : ctx.role, isAgencyRole(ctx.role) ? 'agency' : 'client'),
    names: { agency: helpAgencyName(false, branding.displayName), assistant: assistantName, ...(clientName ? { client: clientName } : {}) },
  };
  return (
    <ShellProviders readOnly={support !== null || billing?.onHold === true} help={help} style={style as Record<string, string>} support={support}>
      <ShellNotices spend={spendAudience ? { audience: spendAudience, items: spendPaused } : null} billing={billing} role={ctx.role} userViewer={viewer.kind === 'user'} agencyName={branding.displayName} />
      {children}
    </ShellProviders>
  );
}
