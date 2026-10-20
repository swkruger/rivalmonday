import { type AccessContext, canAccessClient, renderKbText, toolkit, ToolError, visibleAudiences, type ViewerAudience } from '@cs/core';
import { client, kbArticle, withTenant } from '@cs/db';
import { and, eq, inArray, isNotNull, like, or } from 'drizzle-orm';
import { z } from 'zod';
import type { ToolDeps } from '../deps';
import { helpAudienceFor } from '../kb/audience';
import { kbNamesFor } from '../kb/names';

// Phase 15b-1: page guides for the in-app guide drawer and Help pages. These two tools and the audience filter in
// `search_knowledge` are the boundary for help content: a client viewer never gets an agency or operator row, an agency
// viewer never an operator row. Platform guide rows are RLS-visible to every role, so the audience filter is what hides them.

const { defineTool } = toolkit<ToolDeps>();

const HELP_CONTEXTS = ['platform', 'agency', 'client'] as const;
type HelpContextName = (typeof HELP_CONTEXTS)[number];
/** A page guide's help key (`page:<area>.<page>`); the seed checks guide files against it too. */
export const PAGE_HELP_KEY = /^page:[a-z0-9.-]+$/;

interface GuideRow { id: string; helpKey: string; title: string; bodyMd: string; level: string; audience: string }

/** Resolves the caller's audience and checks the context: platform → operators only; any `clientId` → `canAccessClient`; client context needs one. */
async function guideScope(deps: ToolDeps, ctx: AccessContext, input: { context: HelpContextName; clientId?: string | undefined }): Promise<{ audience: ViewerAudience; clientName?: string }> {
  const audience = await helpAudienceFor(deps, ctx, input.context);
  if (input.context === 'client' && !input.clientId) throw new ToolError('not_found', 'Client not found');
  if (!input.clientId) return { audience };
  if (!canAccessClient(ctx, input.clientId)) throw new ToolError('not_found', 'Client not found');
  const [c] = await withTenant(deps.app, ctx, (tx) => tx.select({ name: client.name }).from(client).where(eq(client.id, input.clientId!)));
  if (!c) throw new ToolError('not_found', 'Client not found');
  return { audience, clientName: c.name };
}

/**
 * A context lists only its own area's guides. 15b-2 decides where account guides (`page:account.*`, none yet) are listed.
 */
const LIST_PREFIX: Record<HelpContextName, string> = { client: 'page:client.%', agency: 'page:agency.%', platform: 'page:platform.%' };

/**
 * Published guide rows the audience may see: platform rows and (outside platform context) the caller agency's own
 * agency-level rows (RLS on top). One `helpKey`, or (for the list) every guide of `context`'s area.
 */
async function guideRows(deps: ToolDeps, ctx: AccessContext, audience: ViewerAudience, key: { helpKey: string } | { context: HelpContextName }): Promise<GuideRow[]> {
  // Platform context reads platform rows only: an operator's own agency-level rows must not shadow operator guides.
  const levels = audience === 'operator' ? eq(kbArticle.level, 'platform') : or(eq(kbArticle.level, 'platform'), and(eq(kbArticle.level, 'agency'), eq(kbArticle.agencyId, ctx.agencyId)));
  const rows = await withTenant(deps.app, ctx, (tx) => tx.select({
    id: kbArticle.id, helpKey: kbArticle.helpKey, title: kbArticle.title, bodyMd: kbArticle.bodyMd, level: kbArticle.level, audience: kbArticle.audience,
  }).from(kbArticle).where(and(
    eq(kbArticle.status, 'published'),
    isNotNull(kbArticle.helpKey),
    'helpKey' in key ? eq(kbArticle.helpKey, key.helpKey) : like(kbArticle.helpKey, LIST_PREFIX[key.context]),
    inArray(kbArticle.audience, visibleAudiences(audience)),
    levels,
  )));
  return rows as GuideRow[];
}

/** One row per help key: the caller agency's agency-level row beats platform; then the exact audience beats `all`. */
function preferred(rows: GuideRow[], audience: ViewerAudience): Map<string, GuideRow> {
  const rank = (r: GuideRow) => (r.level === 'agency' ? 0 : 2) + (r.audience === audience ? 0 : 1);
  const best = new Map<string, GuideRow>();
  for (const r of rows) {
    const cur = best.get(r.helpKey);
    if (!cur || rank(r) < rank(cur) || (rank(r) === rank(cur) && r.id < cur.id)) best.set(r.helpKey, r);
  }
  return best;
}

/** Splits a guide body into its H2 sections (headings inside code fences don't count); text before the first H2 is dropped. */
export function guideSections(body: string): { heading: string; markdown: string }[] {
  const out: { heading: string; lines: string[] }[] = [];
  let fence = false;
  for (const line of body.replace(/\r\n?/g, '\n').split('\n')) {
    if (/^\s{0,3}(```|~~~)/.test(line)) fence = !fence;
    const h = fence ? null : /^## (.+?)\s*$/.exec(line);
    if (h) out.push({ heading: h[1]!, lines: [] });
    else out.at(-1)?.lines.push(line);
  }
  return out.map((s) => ({ heading: s.heading, markdown: s.lines.join('\n').trim() }));
}

async function namesFor(deps: ToolDeps, ctx: AccessContext, audience: ViewerAudience, clientName?: string) {
  const names = await kbNamesFor(deps.service, ctx.agencyId, { clientFacing: audience === 'client' });
  return clientName ? { ...names, clientName } : names;
}

const contextInput = { context: z.enum(HELP_CONTEXTS), clientId: z.string().uuid().optional() };

export const getPageGuide = defineTool({
  name: 'get_page_guide',
  access: 'read',
  description: "The guide for one page, for the viewer's audience, split into its sections; null when the page has none.",
  input: z.object({ helpKey: z.string().max(100).regex(PAGE_HELP_KEY), ...contextInput }),
  output: z.object({ id: z.string(), title: z.string(), sections: z.array(z.object({ heading: z.string(), markdown: z.string() })) }).nullable(),
  permission: 'read',
  async handler(ctx, input, deps) {
    const { audience, clientName } = await guideScope(deps, ctx, input);
    const row = preferred(await guideRows(deps, ctx, audience, { helpKey: input.helpKey }), audience).get(input.helpKey);
    if (!row) return null;
    const names = await namesFor(deps, ctx, audience, clientName);
    return {
      id: row.id, title: renderKbText(row.title, names),
      sections: guideSections(row.bodyMd).map((s) => ({ heading: renderKbText(s.heading, names), markdown: renderKbText(s.markdown, names) })),
    };
  },
});

export const listHelpGuides = defineTool({
  name: 'list_help_guides',
  access: 'read',
  description: "Every page guide of this context's area (client, agency or platform pages) the viewer's audience can open, one per page, by help key.",
  input: z.object(contextInput),
  output: z.object({ guides: z.array(z.object({ helpKey: z.string(), title: z.string(), articleId: z.string() })) }),
  permission: 'read',
  async handler(ctx, input, deps) {
    const { audience, clientName } = await guideScope(deps, ctx, input);
    const best = preferred(await guideRows(deps, ctx, audience, { context: input.context }), audience);
    const names = await namesFor(deps, ctx, audience, clientName);
    return {
      guides: [...best.values()].sort((a, b) => a.helpKey.localeCompare(b.helpKey)).map((r) => ({ helpKey: r.helpKey, title: renderKbText(r.title, names), articleId: r.id })),
    };
  },
});

export const helpTools = [getPageGuide, listHelpGuides];
