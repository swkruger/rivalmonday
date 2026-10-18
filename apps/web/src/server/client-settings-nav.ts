import 'server-only';
import { type NavSection, settingsNavFor } from '@/components/shell/nav-items';
import { clientBillingNoticeOf } from './client-billing-state';
import { requireContext } from './current-viewer';
import { navFlagsFor } from './nav';

/**
 * Phase 15a §2.5: the viewer's Client settings tabs for `/c/<clientId>/settings/*` — the same list the sidebar's
 * "Client settings" entry is gated on. Guests get none (the sidebar never offers them Client settings, §2.3). The
 * owner's Billing tab follows the shell: a signed-in client owner while billing is on for the client
 * (`app-shell.tsx`; `clientBillingNoticeOf` is request-cached, so the shell and this share one read).
 * Cosmetic only: each page keeps its own guard.
 */
export async function clientSettingsSections(clientId: string): Promise<NavSection[]> {
  const { viewer, ctx } = await requireContext();
  const flags = navFlagsFor(viewer);
  if (!flags.isUser && !flags.isAgency) return [];
  const clientBilling = viewer.kind === 'user' && ctx.role === 'client_owner' && (await clientBillingNoticeOf(ctx))?.enabled === true;
  return settingsNavFor('client', { ...flags, clientBilling }, clientId);
}
