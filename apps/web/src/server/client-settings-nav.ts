import 'server-only';
import { canSeeClientSettings, clientSettingsNavFor, type NavSection, showsClientBilling } from '@/components/shell/nav-items';
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
  if (!canSeeClientSettings(flags)) return [];
  const clientBilling = viewer.kind === 'user' && showsClientBilling(ctx.role, await clientBillingNoticeOf(ctx));
  return clientSettingsNavFor({ ...flags, clientBilling }, clientId);
}

/** Whether `/c/<clientId>/settings` (the index) serves this viewer — false for guests — so a breadcrumb may link it. */
export async function hasClientSettings(clientId: string): Promise<boolean> {
  return (await clientSettingsSections(clientId)).length > 0;
}
