'use server';
import { isUuid } from '@cs/core';
import { requireContext } from '@/server/current-viewer';
import { runTool } from '@/server/run-tool';
import type { KbArticle } from '@/components/kb/article-view';

/** Loads one knowledge article through the registered `get_kb_article` tool; any refusal (hidden, unknown, foreign) is `null`. */
export async function loadKbArticle(kbId: string): Promise<KbArticle | null> {
  const { ctx } = await requireContext();
  if (!isUuid(kbId)) return null;
  const r = await runTool<KbArticle>(ctx, 'get_kb_article', { kbId });
  return r.ok ? r.data : null;
}
