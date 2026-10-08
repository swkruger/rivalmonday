import { isAgencyRole } from '@cs/core';
import { client, withTenant } from '@cs/db';
import { type ClientSummary, unreadCount } from '@cs/tools';
import { eq } from 'drizzle-orm';
import { GuestBanner } from '@/components/shell/guest-banner';
import { Sidebar } from '@/components/shell/sidebar';
import { TopBar } from '@/components/shell/top-bar';
import { requireContext } from '@/server/current-viewer';
import { dbs } from '@/server/db';
import { webEnv } from '@/server/env';
import { navFlagsFor } from '@/server/nav';
import { themeForViewer } from '@/server/theme';
import { callTool } from '@/server/tools';

export const dynamic = 'force-dynamic';

/**
 * Accepted (ledgered) for 5a: `list_clients` goes through the audited tool registry, so every agency navigation
 * writes one `audit_log` row just to build the client switcher. The guest top-bar label reads the client name
 * directly through `withTenant` (RLS-scoped, not a registered tool) to avoid adding a second audited call here.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { viewer, ctx } = await requireContext();
  const { branding } = await themeForViewer(viewer);
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
  const unread = await unreadCount(dbs().service, viewer.kind === 'guest' ? { contactId: viewer.contactId } : { userId: viewer.userId });
  return (
    <div className="flex min-h-screen bg-canvas">
      <Sidebar branding={branding} flags={navFlagsFor(viewer, webEnv().platformAdmins)} clients={clients.map(({ id, name }) => ({ id, name }))} />
      <div className="flex min-w-0 flex-1 flex-col">
        {viewer.kind === 'guest' && <GuestBanner />}
        <TopBar viewer={viewer} clients={clients} clientName={clientName} unread={unread} />
        <main className="mx-auto flex w-full max-w-[1560px] flex-col gap-5 px-7 pb-10 pt-6">{children}</main>
      </div>
    </div>
  );
}
