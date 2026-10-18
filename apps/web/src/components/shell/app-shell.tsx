import { type AccessContext, isAgencyRole } from '@cs/core';
import { client, withTenant } from '@cs/db';
import { resolveBranding } from '@cs/email';
import { type ClientSummary, type PlatformRole, platformRole as resolvePlatformRole, unreadCount } from '@cs/tools';
import { themeVars } from '@cs/ui';
import { eq } from 'drizzle-orm';
import { ReadOnlyProvider } from '@/components/read-only';
import { BillingBanner } from '@/components/shell/billing-banner';
import { ClientBillingBanner } from '@/components/shell/client-billing-banner';
import { GuestBanner } from '@/components/shell/guest-banner';
import { MobileNav } from '@/components/shell/mobile-nav';
import { Sidebar } from '@/components/shell/sidebar';
import type { NavFallback } from '@/components/shell/sidebar-nav';
import { ShellTheme } from '@/components/shell/shell-theme';
import { SupportBanner } from '@/components/shell/support-banner';
import { TopBar } from '@/components/shell/top-bar';
import type { BillingSnapshot } from '@/server/billing-state';
import { clientBillingNoticeOf } from '@/server/client-billing-state';
import { dbs } from '@/server/db';
import { navCounts, navFlagsFor } from '@/server/nav';
import { platformAdmins } from '@/server/runtime-env';
import { themeForViewer } from '@/server/theme';
import { callTool } from '@/server/tools';
import type { Viewer } from '@/server/viewer';

/**
 * The signed-in shell shared by `(app)/layout.tsx` (support context during a session) and `(platform)/layout.tsx` (always
 * the operator's own context, Phase 8b M5). Two route groups rather than a path check: App Router keeps a layout mounted
 * across client-side navigation, so one layout choosing by path would go stale on a `<Link>` between `/platform` and
 * `/agency`; crossing groups always renders the other group's layout fresh.
 *
 * Accepted (ledgered) for 5a: `list_clients` goes through the audited tool registry, so every agency navigation
 * writes one `audit_log` row just to build the client switcher. The guest top-bar label reads the client name
 * directly through `withTenant` (RLS-scoped, not a registered tool) to avoid adding a second audited call here.
 */
/** The support banner's height: two lines (h-14) below `sm`, one line (h-9) from `sm` up. */
const BANNER_OFFSET = 'pt-14 sm:pt-9';

/** The platform zone's look (spec §2.3): Rival Monday branding and the default theme, whatever the operator's own agency. */
function platformTheme() {
  const branding = resolveBranding('Rival Monday', null);
  return { branding, style: themeVars(branding), assistantName: 'Friday' };
}

/**
 * `platformRole` (8c): a caller that already resolved the viewer's platform role (the `(platform)` layout) passes it so it is looked up once; omitted (the `(app)` layout), the shell resolves the role itself, once.
 * `zone="platform"` (15a, the `(platform)` layout): the platform menu with Rival Monday branding. `fallback` (the `(app)` layout): the `rm_nav_ctx` cookie, the menu for neutral pages.
 */
export async function AppShell({ viewer, ctx, children, platformRole, billing = null, zone, fallback = null }: { viewer: Exclude<Viewer, { kind: 'member-less' }>; ctx: AccessContext; children: React.ReactNode; platformRole?: PlatformRole | null; billing?: BillingSnapshot | null; zone?: 'platform'; fallback?: NavFallback | null }) {
  // 8b M1: the shell's own viewer themes it — the support agency in `(app)` during a session (g8). 15a: the platform zone
  // is always Rival Monday (no agency logo, colours or name). The root layout's `<html>` vars are never the session's.
  const { branding, style, assistantName } = zone === 'platform' ? platformTheme() : await themeForViewer(viewer);
  const clients = isAgencyRole(ctx.role) ? (await callTool<{ items: ClientSummary[] }>(ctx, 'list_clients', {})).items : [];
  // Client/guest roles always have exactly one client (Review Focus — createAccessContext enforces it), so their
  // top-bar name isn't path-dependent: it's always "their" client, not whichever `/c/<id>` page they're currently on.
  const singleClientId = ctx.clientScope === 'all' ? null : ctx.clientScope[0];
  const clientName =
    !isAgencyRole(ctx.role) && singleClientId
      ? viewer.kind === 'user'
        ? viewer.membership.clientName
        : ((await withTenant(dbs().app, ctx, (tx) => tx.select({ name: client.name }).from(client).where(eq(client.id, singleClientId))))[0]?.name ?? null)
      : null;
  // Phase 8b M2: no inbox in a support session, so the operator's own unread count is never read there.
  const unread = viewer.kind === 'support' ? 0 : await unreadCount(dbs().service, viewer.kind === 'guest' ? { contactId: viewer.contactId } : { userId: viewer.userId });
  const role = viewer.kind !== 'user' ? null : platformRole !== undefined ? platformRole : await resolvePlatformRole({ service: dbs().service, platformAdmins: platformAdmins() }, ctx);
  const operator = role !== null;
  const support = viewer.kind === 'support' ? viewer.session : null;
  // Phase 9b: client roles' billing banners and the owner's Billing entry (only while billing is on for the client).
  const clientBilling = viewer.kind === 'support' ? null : await clientBillingNoticeOf(ctx);
  const navBase = navFlagsFor(viewer, operator, assistantName, role === 'owner');
  // Each zone reads only the badges it can show: agency counts outside the platform zone, platform counts inside it (P1:
  // `(app)` never shows the platform menu).
  const platformZone = zone === 'platform';
  const counts = await navCounts(ctx, { agency: navBase.isAgency && !platformZone, operator: operator && platformZone, leads: navBase.leads === true });
  const flags = {
    ...navBase,
    ...(support ? { backToPlatform: `/platform/agencies/${support.agencyId}` } : {}),
    ...(viewer.kind === 'user' && ctx.role === 'client_owner' && clientBilling?.enabled ? { clientBilling: true } : {}),
  };
  const navClients = clients.map(({ id, name }) => ({ id, name }));
  const menu = (
    <MobileNav displayName={branding.displayName} logoUrl={branding.logoUrl} whiteLabel={branding.displayName !== 'Rival Monday'} flags={flags} counts={counts} zone={zone} fallback={fallback} clients={navClients} />
  );
  return (
    <ReadOnlyProvider readOnly={support !== null}>
      <ShellTheme vars={style} />
      <div data-shell-theme="" className="contents" style={style as React.CSSProperties}>
        {support && <SupportBanner sessionId={support.id} agencyName={support.agencyName} reason={support.reason} expiresAt={support.expiresAt.toISOString()} />}
        <div className={`flex min-h-screen bg-canvas${support ? ` ${BANNER_OFFSET}` : ''}`}>
          <Sidebar branding={branding} flags={flags} counts={counts} zone={zone} fallback={fallback} clients={navClients} offsetTop={support !== null} />
          <div className="flex min-w-0 flex-1 flex-col">
            {viewer.kind === 'guest' && <GuestBanner />}
            <TopBar viewer={viewer} clients={clients} clientName={clientName} unread={unread} menu={menu} />
            {clientBilling && singleClientId && (clientBilling.paused || clientBilling.paymentNeeded) && (
              <ClientBillingBanner role={ctx.role} clientId={singleClientId} agencyName={branding.displayName} paused={clientBilling.paused} paymentNeeded={viewer.kind === 'user' && clientBilling.paymentNeeded} />
            )}
            {viewer.kind === 'user' && billing && <BillingBanner role={ctx.role} state={billing.state} trialEndsAt={billing.trialEndsAt} pausesOn={billing.pausesOn} />}
            <main className="mx-auto flex w-full max-w-[1560px] flex-col gap-5 px-4 pb-10 pt-6 lg:px-7">{children}</main>
          </div>
        </div>
      </div>
    </ReadOnlyProvider>
  );
}
