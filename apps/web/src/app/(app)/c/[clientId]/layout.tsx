import { isAgencyRole, isUuid } from '@cs/core';
import { ClientHelpName } from '@/components/help/client-help-name';
import { requireContext } from '@/server/current-viewer';
import { helpClientName } from '@/server/help';

/**
 * 15b-1 (R8): pass-through layout that tells the help copy which client the page is about (`{client}`). The shell cannot see
 * `/c/<id>`, so an agency viewer's help value has no client name; client roles already have theirs, so no read is made for
 * them. It never refuses and never changes access: pages (and `get_client_profile`'s own check) decide, and an unreadable
 * name just leaves the copy at "your business".
 */
export default async function ClientLayout({ children, params }: { children: React.ReactNode; params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  if (!isUuid(clientId)) return <>{children}</>;
  const { ctx } = await requireContext();
  if (!isAgencyRole(ctx.role)) return <>{children}</>;
  const name = await helpClientName(ctx, clientId);
  return name ? <ClientHelpName name={name}>{children}</ClientHelpName> : <>{children}</>;
}
