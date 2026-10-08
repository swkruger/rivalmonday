import { CHANGE_TYPES } from '@cs/core';
import type { ChangeDetails, NumericChange } from '@cs/db';
import { changeTypeLabel } from '@cs/email';
import type { FactView } from '../tools/schemas';

/** `some_new_thing` → `Some new thing`: the fallback label for keys without a hand-written one. */
export const humanise = (k: string): string => {
  const s = k.replace(/_/g, ' ').trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
};

export const CHANNEL_LABELS: Record<string, string> = {
  web: 'Website', google_ads: 'Google ads', meta_ads: 'Meta ads', google_business_profile: 'Google Business Profile',
  google_reviews: 'Google reviews', google_jobs: 'Google Jobs', rank: 'Local rankings',
};
export const channelLabel = (c: string): string => CHANNEL_LABELS[c] ?? humanise(c);

/** `competitor_source.source` values (`SOURCE_KINDS`, `@cs/collectors`). */
export const SOURCE_LABELS: Record<string, string> = { gbp: 'Google Business Profile', reviews: 'Google reviews', ads_google: 'Google ads', ads_meta: 'Meta ads', jobs: 'Google Jobs' };
export const sourceLabel = (s: string): string => SOURCE_LABELS[s] ?? humanise(s);

export interface DetailLine { label: string; value: string }

/** Decision 5: structured facts of a vendor-channel change, as readable lines (no raw JSON on screen). */
export function detailLines(d: ChangeDetails | null | undefined): DetailLine[] {
  if (!d) return [];
  const out: DetailLine[] = [];
  const pair = (a: unknown, b: unknown) => `${a ?? '—'} → ${b ?? '—'}`;
  if (d.count !== undefined) out.push({ label: 'Count', value: String(d.count) });
  if (d.items?.length) out.push({ label: 'Items', value: d.items.slice(0, 5).map((i) => i.label).join(', ') });
  if (d.field) out.push({ label: 'Field', value: humanise(d.field) });
  if (d.ratingBefore !== undefined || d.ratingAfter !== undefined) out.push({ label: 'Rating', value: pair(d.ratingBefore, d.ratingAfter) });
  if (d.votesBefore !== undefined || d.votesAfter !== undefined) out.push({ label: 'Reviews', value: pair(d.votesBefore, d.votesAfter) });
  if (d.themeName) out.push({ label: 'Theme', value: d.themeName });
  if (d.keyword) out.push({ label: 'Keyword', value: d.keyword });
  if (d.avgRankBefore !== undefined || d.avgRankAfter !== undefined) out.push({ label: 'Average rank', value: pair(d.avgRankBefore, d.avgRankAfter) });
  if (d.top3Before !== undefined || d.top3After !== undefined) out.push({ label: 'Top-3 points', value: pair(d.top3Before, d.top3After) });
  if (d.offer) out.push({ label: 'Offer', value: 'Yes' });
  return out;
}

export const factView = (c: NumericChange): FactView => ({ kind: c.kind, before: c.before?.raw ?? null, after: c.after?.raw ?? null, pct: c.pct });

export const changeTypeOptions = (): { id: string; label: string }[] =>
  CHANGE_TYPES.filter((t) => t !== 'cosmetic').map((t) => ({ id: t, label: changeTypeLabel(t) }));
