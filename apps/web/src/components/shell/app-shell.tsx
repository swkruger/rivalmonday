import { type AccessContext, isAgencyRole } from '@cs/core';
import { client, withTenant } from '@cs/db';
import { type ClientSummary, isPlatformOperator, unreadCount } from '@cs/tools';
import { eq } from 'drizzle-orm';
import { ReadOnlyProvider } from '@/components/read-only';
import { GuestBanner } from '@/components/shell/guest-banner';
import { MobileNav } from '@/components/shell/mobile-nav';
import { Sidebar } from '@/components/shell/sidebar';
import { ShellTheme } from '@/components/shell/shell-theme';
import { SupportBanner } from '@/components/shell/support-banner';
import { TopBar } from '@/components/shell/top-bar';
import { dbs } from '@/server/db';
import { navFlagsFor } from '@/server/nav';
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

export async function AppShell({ viewer, ctx, children }: { viewer: Exclude<Viewer, { kind: 'member-less' }>; ctx: AccessContext; children: React.ReactNode }) {
  // 8b M1: the shell's own viewer themes it — the support agency in `(app)` during a session (g8), the operator's own
  // agency in `(platform)`. The root layout's `<html>` vars are never the session's (it uses the operator viewer).
  const { branding, style, assistantName } = await themeForViewer(viewer);
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
  const operator = viewer.kind === 'user' && (await isPlatformOperator({ service: dbs().service, platformAdmins: platformAdmins() }, ctx));
  const support = viewer.kind === 'support' ? viewer.session : null;
  const flags = { ...navFlagsFor(viewer, operator, assistantName), ...(support ? { backToPlatform: `/platform/agencies/${support.agencyId}` } : {}) };
  const navClients = clients.map(({ id, name }) => ({ id, name }));
  const menu = (
    <MobileNav displayName={branding.displayName} logoUrl={branding.logoUrl} whiteLabel={branding.displayName !== 'Rival Monday'} flags={flags} clients={navClients} />
  );
  return (
    <ReadOnlyProvider readOnly={support !== null}>
      <ShellTheme vars={style} />
      <div data-shell-theme="" className="contents" style={style as React.CSSProperties}>
        {support && <SupportBanner sessionId={support.id} agencyName={support.agencyName} reason={support.reason} expiresAt={support.expiresAt.toISOString()} />}
        <div className={`flex min-h-screen bg-canvas${support ? ` ${BANNER_OFFSET}` : ''}`}>
          <Sidebar branding={branding} flags={flags} clients={navClients} offsetTop={support !== null} />
          <div className="flex min-w-0 flex-1 flex-col">
            {viewer.kind === 'guest' && <GuestBanner />}
            <TopBar viewer={viewer} clients={clients} clientName={clientName} unread={unread} menu={menu} />
            <main className="mx-auto flex w-full max-w-[1560px] flex-col gap-5 px-4 pb-10 pt-6 lg:px-7">{children}</main>
          </div>
        </div>
      </div>
    </ReadOnlyProvider>
  );
}
