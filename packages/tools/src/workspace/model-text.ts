import { redactForModel } from '@cs/collectors';
import type { CallMeta } from '@cs/core';

/**
 * d12: captured text (scraped pages, reviews, ad creatives, event summaries) returned over a non-web channel passes through
 * `redactForModel`; the web UI shows it as stored. Pass the business's own name so it is never mistaken for a person.
 */
export function forChannel(meta: CallMeta, text: string, businessNames?: readonly (string | null | undefined)[]): string;
export function forChannel(meta: CallMeta, text: string | null, businessNames?: readonly (string | null | undefined)[]): string | null;
export function forChannel(meta: CallMeta, text: string | null, businessNames: readonly (string | null | undefined)[] = []): string | null {
  if (text === null || meta.channel === 'web') return text;
  return redactForModel(text, { businessNames });
}

/** d12 for event/move rows: their `summary` goes through `forChannel`, with the competitor's name kept. Web rows pass through unchanged. */
export function summaryForChannel<T extends { summary: string; competitorName: string }>(meta: CallMeta, row: T): T {
  return meta.channel === 'web' ? row : { ...row, summary: forChannel(meta, row.summary, [row.competitorName]) };
}
