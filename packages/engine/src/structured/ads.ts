import { ad, type ChangeItem } from '@cs/db';
import { and, eq, gte, isNotNull, isNull, or } from 'drizzle-orm';
import type { SourceDiffer, StructuredChange } from './vendor-diff';

/** A creative first seen in a capture is "started" only if the vendor says it began this recently — not an old ad newly in view. */
export const AD_START_WINDOW_DAYS = 30;
/** Items listed on one change (the count covers all of them). */
export const MAX_CHANGE_ITEMS = 25;
const DAY_MS = 86_400_000;

type AdEvent = { name: string; startsAt: string | null };

/** The ad's copy (or title, else its id); an ad promoting an event appends ` — promotes event "<name>" (<YYYY-MM-DD>)` (D4). */
export const adLabel = (a: { externalId: string; title: string | null; text: string | null; event?: AdEvent | null }): string => {
  const base = (a.text ?? a.title ?? '').replace(/\s+/g, ' ').trim().slice(0, 200) || `creative ${a.externalId}`;
  if (!a.event) return base;
  const date = a.event.startsAt ? ` (${a.event.startsAt.slice(0, 10)})` : '';
  return `${base} — promotes event "${a.event.name.replace(/\s+/g, ' ').trim().slice(0, 120)}"${date}`;
};

export function pageIdOf(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).searchParams.get('view_all_page_id');
  } catch {
    return null;
  }
}

/**
 * Ads started in this capture (first seen here, recently started, not first seen already inactive) and ads
 * ended by it (`ended_capture_id`), each grouped into one change whose count drives the size curve.
 * Meta captures are per page, so both sets are already scoped to the page.
 */
export const diffAds: SourceDiffer = async (db, cap) => {
  const platform = cap.source === 'meta_ads' ? 'meta' : 'google';
  const startedSince = new Date(cap.capturedAt.getTime() - AD_START_WINDOW_DAYS * DAY_MS);
  const mine = and(eq(ad.competitorId, cap.competitorId), eq(ad.platform, platform));
  const started = await db
    .select()
    .from(ad)
    .where(and(mine, eq(ad.firstCaptureId, cap.id), or(isNull(ad.startedAt), gte(ad.startedAt, startedSince)), or(eq(ad.isActive, true), isNotNull(ad.endedCaptureId))));
  const stopped = await db.select().from(ad).where(and(mine, eq(ad.endedCaptureId, cap.id)));
  const pageId = platform === 'meta' ? pageIdOf(cap.url) : null;
  const items = (rows: typeof started): ChangeItem[] =>
    rows.slice(0, MAX_CHANGE_ITEMS).map((a) => ({ id: a.externalId, label: adLabel(a), ...(a.event ? { event: a.event } : {}) }));
  const text = (rows: typeof started) => items(rows).map((i) => i.label).join('\n');
  const out: StructuredChange[] = [];
  if (started.length > 0) {
    out.push({ kind: 'added', blockKey: `ads:${platform}:started`, beforeText: null, afterText: text(started), details: { changeType: 'ad_started', count: started.length, items: items(started), pageId } });
  }
  if (stopped.length > 0) {
    out.push({ kind: 'removed', blockKey: `ads:${platform}:stopped`, beforeText: text(stopped), afterText: null, details: { changeType: 'ad_stopped', count: stopped.length, items: items(stopped), pageId } });
  }
  return out;
};
