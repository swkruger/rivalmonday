import 'server-only';
import { type AccessContext, glossaryFor, isAgencyRole, viewerAudience } from '@cs/core';
import { groupGuides, type HelpGuide } from '@/components/help/help-groups';
import type { HelpIndexProps } from '@/components/help/help-index';
import { type NavContext, navFor, settingsNavFor } from '@/components/shell/nav-items';
import { renderCopy } from '@/help/copy';
import { navFlagsFor } from './nav';
import { themeForViewer } from './theme';
import { callTool, tryCallTool } from './tools';
import type { Viewer } from './viewer';

const EXCERPT = 200;

/**
 * 15b-1: everything the three Help pages show, from registered tools only. The guide list is read with `callTool`, so a
 * refused context (platform for a non-operator, a client the viewer cannot open) is a 404. The guide list, the glossary and
 * the search are audience-filtered by the viewer's role (`viewerAudience`), never by the URL. A support session gets no
 * Ask link: the Ask page auto-sends its `?q=`, which a read-only session cannot do.
 */
export async function loadHelpIndex(o: {
  viewer: Exclude<Viewer, { kind: 'member-less' }>;
  ctx: AccessContext;
  context: NavContext;
  clientId?: string;
  q?: string | undefined;
  platformOwner?: boolean;
}): Promise<HelpIndexProps> {
  const { viewer, ctx, context, clientId } = o;
  const query = (o.q ?? '').trim().slice(0, 300);
  const [{ guides }, theme] = await Promise.all([
    callTool<{ guides: HelpGuide[] }>(ctx, 'list_help_guides', { context, ...(clientId ? { clientId } : {}) }),
    themeForViewer(viewer),
  ]);
  const flags = navFlagsFor(viewer, context === 'platform', theme.assistantName, o.platformOwner === true);
  const menu = navFor(context, flags, clientId ?? null);
  const settings = context === 'agency' ? settingsNavFor('agency', flags) : context === 'client' && clientId ? settingsNavFor('client', flags, clientId) : [];

  const search = query
    ? await tryCallTool<{ results: { kbId: string; title: string; chunks: string[] }[] }>(ctx, 'search_knowledge', {
        query, limit: 8, ...(clientId ? { clientId } : {}), ...(context === 'platform' ? { context } : {}),
      })
    : null;

  const names = { agency: theme.branding.displayName, assistant: theme.assistantName };
  const audience = viewerAudience(viewer.kind === 'guest' ? 'guest' : ctx.role, context);
  const askable = context === 'client' && !!clientId && !!flags.ask && viewer.kind !== 'support';
  return {
    articleBase: context === 'platform' ? '/platform/knowledge' : '/kb',
    groups: groupGuides(context, menu, settings, guides),
    glossary: glossaryFor(audience).map((t) => ({
      id: t.id, term: renderCopy(t.term, names), short: renderCopy(t.short, names), ...(t.long ? { long: renderCopy(t.long, names) } : {}),
    })),
    query,
    results: query ? (search?.results ?? []).map((r) => ({ kbId: r.kbId, title: r.title, excerpt: (r.chunks[0] ?? '').replace(/\s+/g, ' ').slice(0, EXCERPT) })) : null,
    ask: askable ? { href: `/c/${clientId}/ask`, label: `Ask ${theme.assistantName}` } : null,
    // The agency's own sender address, shown to client roles only; none set = no line.
    contactEmail: context === 'client' && !isAgencyRole(ctx.role) ? theme.branding.fromEmail : null,
  };
}
