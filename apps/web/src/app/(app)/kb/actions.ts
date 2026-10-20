'use server';
import { isUuid } from '@cs/core';
import { requireContext, requireOperatorContext } from '@/server/current-viewer';
import { navFlagsFor } from '@/server/nav';
import { runTool } from '@/server/run-tool';
import type { KbArticle } from '@/components/kb/article-view';
import type { PageGuideData, PageGuideResult } from '@/components/help/page-guide';

/** Loads one knowledge article through the registered `get_kb_article` tool; any refusal (hidden, unknown, foreign) is `null`. */
export async function loadKbArticle(kbId: string): Promise<KbArticle | null> {
  const { ctx } = await requireContext();
  if (!isUuid(kbId)) return null;
  const r = await runTool<KbArticle>(ctx, 'get_kb_article', { kbId });
  return r.ok ? r.data : null;
}

/**
 * 15b-1: lazy-loads one page guide for the Guide sheet through `get_page_guide`. The platform context uses the operator's
 * own ctx (like every `/platform` page). Any refusal is `guide: null`. `canAsk` = the viewer's Ask module is on (the same
 * flag that shows the Ask menu item), and never in a support session (Ask pages 404 there).
 */
export async function loadPageGuide(helpKey: string, context: 'platform' | 'agency' | 'client', clientId?: string): Promise<PageGuideResult> {
  const { viewer, ctx } = context === 'platform' ? await requireOperatorContext() : await requireContext();
  if (clientId !== undefined && !isUuid(clientId)) return { guide: null, canAsk: false };
  const r = await runTool<PageGuideData | null>(ctx, 'get_page_guide', { helpKey, context, ...(clientId ? { clientId } : {}) });
  const canAsk = viewer.kind === 'user' && navFlagsFor({ kind: viewer.kind, ctx }).ask === true;
  return { guide: r.ok ? r.data : null, canAsk };
}
