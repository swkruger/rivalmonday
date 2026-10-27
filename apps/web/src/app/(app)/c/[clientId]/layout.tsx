import { type AccessContext, hasChannel, isAgencyRole, isUuid } from '@cs/core';
import { displayNameFor } from '@cs/mcp';
import { FridayDock, type FridayDockConfig } from '@/components/ask/friday-dock';
import { ClientHelpName } from '@/components/help/client-help-name';
import { assistantNameForRequest } from '@/server/ask';
import { requireContext } from '@/server/current-viewer';
import { dbs } from '@/server/db';
import { helpClientName } from '@/server/help';
import { tryCallTool } from '@/server/tools';
import { askEvidenceRefs, saveAskRecommendation } from './ask/actions';

/**
 * 15b-1 (R8): pass-through layout that tells the help copy which client the page is about (`{client}`). The shell cannot see
 * `/c/<id>`, so an agency viewer's help value has no client name; client roles already have theirs, so no help-name read is
 * made for them. 16d (D-14, P6): it also mounts the docked Friday panel for signed-in users with Ask — here because a
 * layout is not re-rendered on client-side navigation, so the panel and its conversation survive moving between pages.
 * It never refuses and never changes access: pages (and each tool's own check) decide; an unreadable name just leaves the
 * copy at "your business", and any refused or failed read just leaves out the dock.
 */
export default async function ClientLayout({ children, params }: { children: React.ReactNode; params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  if (!isUuid(clientId)) return <>{children}</>;
  const { viewer, ctx } = await requireContext();
  const askable = viewer.kind === 'user' && !ctx.support && !ctx.userId.startsWith('contact:') && hasChannel(ctx, 'ask');
  const [name, config] = await Promise.all([
    isAgencyRole(ctx.role) ? helpClientName(ctx, clientId) : Promise.resolve(null),
    askable ? dockConfig(ctx, clientId) : Promise.resolve(null),
  ]);
  const page = <FridayDock config={config}>{children}</FridayDock>;
  return name ? <ClientHelpName name={name}>{page}</ClientHelpName> : page;
}

/** The panel's reads, all at once; null (no dock) on any refusal or failure, so the layout renders whatever happens. */
async function dockConfig(ctx: AccessContext, clientId: string): Promise<FridayDockConfig | null> {
  try {
    const [starters, scopeLabel, assistantName, productName] = await Promise.all([
      tryCallTool<{ questions: string[]; reviewAllowed: boolean }>(ctx, 'get_ask_starters', { clientId }),
      // The scope chip: `get_client_profile` via `tryCallTool` in the request-cached help read (one audited call, shared with the help name).
      helpClientName(ctx, clientId),
      assistantNameForRequest(ctx.agencyId),
      displayNameFor(dbs().service, ctx.agencyId),
    ]);
    if (!starters || !scopeLabel) return null;
    return {
      clientId,
      assistantName,
      productName,
      reviewAllowed: starters.reviewAllowed,
      starters: starters.questions,
      scopeLabel,
      saveAction: saveAskRecommendation,
      refsAction: askEvidenceRefs,
    };
  } catch (e) {
    console.error('[ask] dock config failed', e instanceof Error ? e.message : e);
    return null;
  }
}
