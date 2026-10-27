import { isAgencyRole, isUuid } from '@cs/core';
import { ClientHelpName } from '@/components/help/client-help-name';
import { requireContext } from '@/server/current-viewer';
import { helpClientName } from '@/server/help';

/**
 * Same as `(app)/c/[clientId]/layout.tsx` (15b-1, R8): a pass-through layout that tells the help copy which client the page
 * is about (`{client}`) for the setup flow, which lives in this route group. It never refuses and never changes access.
 */
export default async function OnboardingClientLayout({ children, params }: { children: React.ReactNode; params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  if (!isUuid(clientId)) return <>{children}</>;
  const { ctx } = await requireContext();
  if (!isAgencyRole(ctx.role)) return <>{children}</>;
  const name = await helpClientName(ctx, clientId);
  return name ? <ClientHelpName name={name}>{children}</ClientHelpName> : <>{children}</>;
}
