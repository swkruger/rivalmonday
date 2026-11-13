import { type AccessContext, isAgencyRole, viewerAudience } from '@cs/core';
import { client, withTenant } from '@cs/db';
import { resolveBranding } from '@cs/email';
import { type ClientSummary, type PlatformRole, platformRole as resolvePlatformRole, unreadCount } from '@cs/tools';
import { themeVars } from '@cs/ui';
import { eq } from 'drizzle-orm';
import type { SwitcherProps } from '@/components/shell/context-switcher';
import { ClientBillingBanner } from '@/components/shell/client-billing-banner';
import { BANNER_HEIGHT, SHELL_OFFSET } from '@/components/shell/banner-height';
import { GuestBanner } from '@/components/shell/guest-banner';
import { MobileNav } from '@/components/shell/mobile-nav';
import { showsClientBilling } from '@/components/shell/nav-items';
import { Sidebar } from '@/components/shell/sidebar';
import type { NavCounts } from '@/components/shell/nav-items';
import type { NavFallback } from '@/components/shell/sidebar-nav';
import { ShellBrand } from '@/components/shell/shell-brand';
import { ShellNotices, ShellProviders } from '@/components/shell/shell-providers';
import { TopBar } from '@/components/shell/top-bar';
import type { BillingSnapshot } from '@/server/billing-state';
import { type ClientBillingNotice, clientBillingNoticeOf } from '@/server/client-billing-state';
import { dbs } from '@/server/db';
import { helpAgencyName } from '@/server/help';
import { navCounts, navFlagsFor } from '@/server/nav';
import { platformAdmins, supportEmail } from '@/server/runtime-env';
import { themeForViewer } from '@/server/theme';
import { callTool } from '@/server/tools';
import { verticalOptions } from '@/server/verticals';
import type { Viewer } from '@/server/viewer';

/**
 * The signed-in shell shared by `(app)/layout.tsx` (support context during a session) and `(platform)/layout.tsx` (always
 * the operator's own context, Phase 8b M5). Two route groups rather than a path check: App Router keeps a layout mounted
 * across client-side navigation, so one layout choosing by path would go stale on a `<Link>` between `/platform` and
 * `/agency`; crossing groups always renders the other group's layout fresh.
 *
 * Accepted (ledgered) for 5a: `list_clients` goes through the audited tool registry, so every agency navigation
 * writes one `audit_log` row just to build the context switcher (15a: it lists them; sub-line = the vertical's name
 * from the static, process-cached vertical packs — no extra tool call). The guest top-bar label reads the client name
 * directly through `withTenant` (RLS-scoped, not a registered tool) to avoid adding a second audited call here.
 */

/** The platform zone's look (spec §2.3): Rival Monday branding and the default theme, whatever the operator's own agency. */
function platformTheme() {
  const branding = resolveBranding('Rival Monday', null);
  return { branding, style: themeVars(branding), assistantName: 'Friday' };
}

type ShellTheme = { branding: ReturnType<typeof resolveBranding>; style: Record<string, string>; assistantName: string };

/** Everything the shell reads, resolved by `startShellReads` in one batch. */
export interface ShellReads {
  theme: ShellTheme;
  clients: ClientSummary[];
  clientName: string | null | undefined;
  unread: number;
  role: PlatformRole | null;
  clientBilling: ClientBillingNotice | null;
  spendPaused: { clientId: string; name: string; until: string }[];
  counts: NavCounts;
  /** 18d: clients whose Events menu entry shows. */
  eventsClientIds: string[];
  verticals: { id: string; name: string }[];
}

/**
 * Launch gate (Task 4): the shell's reads, all started together (one DB stage group, not a nine-read waterfall). Each
 * depends only on the already-resolved viewer and context — the access check ran in `requireContext` /
 * `requireOperatorContext` before any caller gets here — never on another read: the client id comes from the context,
 * the role from `platformRole` when the caller resolved it. The one exception: the platform zone without a passed role
 * waits for the role before its platform badge counts (no caller does that today).
 * Decorative reads degrade exactly as before: a failed spend status drops the banner, a failed vertical catalogue the
 * switcher sub-line, and nav counts never throw. A failed `list_clients`, client name, unread, role or billing read still
 * fails the shell. The `(app)` layout starts this before its onboarding check so that read joins the batch.
 */
export function startShellReads(viewer: Exclude<Viewer, { kind: 'member-less' }>, ctx: AccessContext, { zone, platformRole }: { zone?: 'platform'; platformRole?: PlatformRole | null } = {}): Promise<ShellReads> {
  const platformZone = zone === 'platform';
  const agencyView = isAgencyRole(ctx.role);
  // Client/guest roles always have exactly one client (Review Focus — createAccessContext enforces it), so their
  // switcher name isn't path-dependent: it's always "their" client, not whichever `/c/<id>` page they're currently on.
  const singleClientId = ctx.clientScope === 'all' ? null : ctx.clientScope[0];
  // 8b M1: the shell's own viewer themes it — the support agency in `(app)` during a session (g8). 15a: the platform zone
  // is always Rival Monday (no agency logo, colours or name). The root layout's `<html>` vars are never the session's.
  const theme: Promise<ShellTheme> = platformZone ? Promise.resolve(platformTheme()) : themeForViewer(viewer);
  const clients = agencyView ? callTool<{ items: ClientSummary[] }>(ctx, 'list_clients', {}).then((r) => r.items) : Promise.resolve([]);
  const clientName: Promise<string | null | undefined> =
    !agencyView && singleClientId
      ? viewer.kind === 'user'
        ? Promise.resolve(viewer.membership.clientName)
        : withTenant(dbs().app, ctx, (tx) => tx.select({ name: client.name }).from(client).where(eq(client.id, singleClientId))).then((rows) => rows[0]?.name ?? null)
      : Promise.resolve(null);
  // Phase 8b M2: no inbox in a support session, so the operator's own unread count is never read there.
  const unread = viewer.kind === 'support' ? Promise.resolve(0) : unreadCount(dbs().service, viewer.kind === 'guest' ? { contactId: viewer.contactId } : { userId: viewer.userId });
  const role: Promise<PlatformRole | null> =
    viewer.kind !== 'user' ? Promise.resolve(null) : platformRole !== undefined ? Promise.resolve(platformRole) : resolvePlatformRole({ service: dbs().service, platformAdmins: platformAdmins() }, ctx);
  // Phase 9b: client roles' billing banners and the owner's Billing entry (only while billing is on for the client).
  const clientBilling = viewer.kind === 'support' ? Promise.resolve(null) : clientBillingNoticeOf(ctx);
  // 7b1: calm pause notice. Agency admins (not account managers) see their paused clients, client roles their own client;
  // never in the platform zone. Cosmetic, so a failed read only drops the banner (the shell must render).
  const spendAudience = spendAudienceOf(ctx, zone);
  const spendPaused =
    spendAudience && (spendAudience === 'agency' || singleClientId)
      ? callTool<{ paused: { clientId: string; name: string; until: string }[] }>(ctx, 'get_spend_status', spendAudience === 'agency' ? {} : { clientId: singleClientId }).then((r) => r.paused ?? [], () => [])
      : Promise.resolve([]);
  // Each zone reads only the badges it can show: agency counts outside the platform zone, platform counts inside it (P1:
  // `(app)` never shows the platform menu). Only the platform badges depend on the role.
  const base = navFlagsFor(viewer);
  const countsFor = (operator: boolean) => navCounts(ctx, { agency: base.isAgency && !platformZone, operator: operator && platformZone, leads: base.leads === true });
  const counts = platformZone && viewer.kind === 'user' && platformRole === undefined ? role.then((r) => countsFor(r !== null)) : countsFor(viewer.kind === 'user' && platformRole != null);
  // The switcher's sub-line is cosmetic: an unreadable catalogue only drops it (the shell must render). Read only where a
  // client list can show (agency roles); with no clients the names go unused.
  const verticals = agencyView ? verticalOptions().catch(() => []) : Promise.resolve([]);
  // 18d: which clients show the Events menu entry (`get_client_events_menu`, no clientId = every visible client). Not in the
  // platform zone (no client menu there); cosmetic, so a failed read only hides the entry.
  const eventsClientIds = platformZone
    ? Promise.resolve([] as string[])
    : callTool<{ clientIds: string[] }>(ctx, 'get_client_events_menu', {}).then((r) => r.clientIds ?? [], () => [] as string[]);
  return Promise.all([theme, clients, clientName, unread, role, clientBilling, spendPaused, counts, eventsClientIds, verticals]).then(
    ([theme, clients, clientName, unread, role, clientBilling, spendPaused, counts, eventsClientIds, verticals]) => ({ theme, clients, clientName, unread, role, clientBilling, spendPaused, counts, eventsClientIds, verticals }),
  );
}

function spendAudienceOf(ctx: AccessContext, zone?: 'platform'): 'agency' | 'client' | null {
  return zone === 'platform' ? null : ctx.role === 'agency_admin' ? 'agency' : ctx.role === 'client_owner' || ctx.role === 'client_viewer' ? 'client' : null;
}

/**
 * `platformRole` (8c): a caller that already resolved the viewer's platform role (the `(platform)` layout) passes it so it is looked up once; omitted (the `(app)` layout), the shell resolves the role itself, once.
 * `zone="platform"` (15a, the `(platform)` layout): the platform menu with Rival Monday branding. `fallback` (the `(app)` layout): the `rm_nav_ctx` cookie, the menu for neutral pages.
 * `reads` (launch gate): a batch the caller already started with `startShellReads` for this same viewer, ctx, zone and role; omitted, the shell starts its own.
 */
export async function AppShell({ viewer, ctx, children, platformRole, billing = null, zone, fallback = null, reads }: { viewer: Exclude<Viewer, { kind: 'member-less' }>; ctx: AccessContext; children: React.ReactNode; platformRole?: PlatformRole | null; billing?: BillingSnapshot | null; zone?: 'platform'; fallback?: NavFallback | null; reads?: Promise<ShellReads> }) {
  const { theme, clients, clientName, unread, role, clientBilling, spendPaused, counts, eventsClientIds, verticals } = await (reads ?? startShellReads(viewer, ctx, { zone, platformRole }));
  const { branding, style, assistantName } = theme;
  const singleClientId = ctx.clientScope === 'all' ? null : ctx.clientScope[0];
  const operator = role !== null;
  const support = viewer.kind === 'support' ? viewer.session : null;
  const spendAudience = spendAudienceOf(ctx, zone);
  const navBase = navFlagsFor(viewer, operator, assistantName, role === 'owner');
  const flags = {
    ...navBase,
    ...(eventsClientIds.length ? { eventsClientIds } : {}),
    ...(support ? { backToPlatform: `/platform/agencies/${support.agencyId}` } : {}),
    ...(viewer.kind === 'user' && showsClientBilling(ctx.role, clientBilling) ? { clientBilling: true } : {}),
  };
  const navClients = clients.map(({ id, name }) => ({ id, name }));
  const verticalName = new Map(clients.length ? verticals.map((v) => [v.id, v.name]) : []);
  // Spec §2.4: navigation only (D3) — every list is the viewer's own clients/memberships; a support session shows the
  // supported agency's clients (its ctx) and "Back to platform", never the operator's memberships.
  const switcher: SwitcherProps = {
    zone, flags, fallback,
    agencyName: viewer.kind === 'user' ? viewer.membership.agencyName : support ? support.agencyName : branding.displayName,
    clients: isAgencyRole(ctx.role)
      ? clients.map((c) => ({ id: c.id, name: c.name, sub: verticalName.get(c.verticalId) ?? null, setup: false }))
      : singleClientId && clientName ? [{ id: singleClientId, name: clientName, sub: null, setup: false }] : [],
    ownAgencies: viewer.kind === 'user' ? viewer.memberships.filter((m) => isAgencyRole(m.role)).map((m) => ({ membershipId: m.id, name: m.agencyName })) : [],
    currentMembershipId: viewer.kind === 'user' ? viewer.membership.id : null,
    supportAgency: support && flags.backToPlatform ? { name: support.agencyName, backHref: flags.backToPlatform } : null,
    accounts: viewer.kind === 'user' && !isAgencyRole(ctx.role)
      ? viewer.memberships.map((m) => ({ membershipId: m.id, name: m.clientName ?? m.agencyName, sub: m.clientName ? m.agencyName : 'Agency view' }))
      : [],
  };
  // 15b: who is reading the help copy. The shell knows the zone (platform vs not) and role, not the `/c/<id>` path, so an
  // agency viewer's `client` name is left unset (copy then reads "the client"). Never "Rival Monday" as the agency.
  // `HelpProvider` (server) ships only this audience's tips, empty states and glossary terms to the browser (I1).
  const helpAgency = helpAgencyName(zone === 'platform', branding.displayName);
  const help = {
    audience: viewerAudience(viewer.kind === 'guest' ? 'guest' : ctx.role, zone === 'platform' ? 'platform' : isAgencyRole(ctx.role) ? 'agency' : 'client'),
    names: { agency: helpAgency, assistant: assistantName, ...(clientName ? { client: clientName } : {}) },
  };
  const menu = <MobileNav flags={flags} counts={counts} zone={zone} fallback={fallback} clients={navClients} switcher={switcher} />;
  const brand = <ShellBrand displayName={branding.displayName} logoUrl={branding.logoUrl} whiteLabel={branding.displayName !== 'Rival Monday'} />;
  // 2026-11-03 (owner): the top bar spans the frame and sticks (under the fixed support banner, which never scrolls away);
  // the sidebar and sheet sit below it. The guest banner scrolls with the page above the bar; the billing / spend / hold
  // notices stay above the sheet. `SHELL_OFFSET` sets the sticky offsets for the bar, the sidebar and sticky page content.
  return (
    <ShellProviders readOnly={support !== null || billing?.onHold === true} help={help} style={style as Record<string, string>} support={support}>
      <div data-slot="shell" className={`flex min-h-screen flex-col bg-canvas ${support ? `${SHELL_OFFSET.support} ${BANNER_HEIGHT.offset}` : SHELL_OFFSET.plain}`}>
        {viewer.kind === 'guest' && <GuestBanner />}
        <TopBar viewer={viewer} switcher={switcher} unread={unread} brand={brand} menu={menu} supportEmail={viewer.kind === 'user' && isAgencyRole(ctx.role) ? supportEmail() : null} />
        <div className="flex min-w-0 flex-1">
          <Sidebar flags={flags} counts={counts} zone={zone} fallback={fallback} clients={navClients} switcher={switcher} />
          <div className="flex min-w-0 flex-1 flex-col">
            {clientBilling && singleClientId && (clientBilling.paused || clientBilling.paymentNeeded) && (
              <ClientBillingBanner role={ctx.role} clientId={singleClientId} agencyName={branding.displayName} paused={clientBilling.paused} paymentNeeded={viewer.kind === 'user' && clientBilling.paymentNeeded} />
            )}
            <ShellNotices spend={spendAudience ? { audience: spendAudience, items: spendPaused } : null} billing={billing} role={ctx.role} userViewer={viewer.kind === 'user'} agencyName={branding.displayName} />
            {/* 16b (D-02, P2): one white sheet in the canvas frame. No overflow utility: sticky SaveBar / page headers need the viewport as scroll root. */}
            <main data-slot="sheet" className="min-w-0 flex-1 bg-surface lg:mr-2 lg:mb-2 lg:rounded-md lg:border lg:border-line">
              <div data-slot="sheet-inner" className="mx-auto flex w-full max-w-[1560px] flex-col gap-10 px-4 pt-6 pb-10 md:px-6 lg:px-8">{children}</div>
            </main>
          </div>
        </div>
      </div>
    </ShellProviders>
  );
}
