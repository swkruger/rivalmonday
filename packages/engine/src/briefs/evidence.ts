import { redactForModel } from '@cs/collectors';
import { capture, changeEvent, detectedChange, type Db, evidence, eventChange, trackedPage } from '@cs/db';
import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { GBP_STATUS_PHRASE } from '../structured/gbp-status';
import { buildStructuredSummary, isStructuredChange } from '../tag/structured';

export const EVIDENCE_TEXT_CHARS = 300;
const ITEM_LABELS = 5;

export interface EvidenceChange {
  changeId: string;
  channel: string;
  capturedAt: Date | null;
  pageUrl: string | null;
  captureId: string | null;
  evidenceIds: string[];
  /** Redacted, model-ready description of the change; the verifier checks claims against exactly this text. */
  text: string;
}

/** Human channel names for evidence head lines (brief-signal D4); an unknown channel shows its id. */
export const EVIDENCE_CHANNEL_LABEL: Record<string, string> = {
  web: 'Website', google_ads: 'Google Ads', meta_ads: 'Meta ads', google_business_profile: 'Google Business Profile',
  google_reviews: 'Google reviews', google_jobs: 'Google Jobs', rank: 'Local map rankings',
};

export { GBP_STATUS_PHRASE };

/** `status: closed_forever` -> `status: permanently closed` (before/after text of a `status_change`). */
const statusText = (s: string): string => s.replace(/^status:\s*(\S+)\s*$/, (_m, raw: string) => `status: ${GBP_STATUS_PHRASE[raw.toLowerCase()] ?? 'open'}`);

const trunc = (s: string) => (s.length > EVIDENCE_TEXT_CHARS ? `${s.slice(0, EVIDENCE_TEXT_CHARS - 1)}…` : s);

/** Scraped text sits inside <evidence>/<candidate> blocks of the writer prompt: never let it close or open one. */
export function escapeEvidence(text: string): string {
  return text.replace(/<(\/?)(evidence|candidate)/gi, '&lt;$1$2');
}

function describe(c: typeof detectedChange.$inferSelect, names: string[]): string {
  const red = (s: string | null) => (s === null ? null : trunc(redactForModel(s, { businessNames: names })));
  const lines: string[] = [];
  if (!isStructuredChange(c)) {
    if (c.kind === 'added') lines.push(`Added: "${red(c.afterText)}"`);
    else if (c.kind === 'removed') lines.push(`Removed: "${red(c.beforeText)}"`);
    else lines.push(`Before: "${red(c.beforeText)}"`, `After: "${red(c.afterText)}"`);
  } else {
    lines.push(redactForModel(buildStructuredSummary(c, names), { businessNames: names }));
    if (c.kind === 'modified' && c.beforeText !== null && c.afterText !== null) {
      const status = c.details.changeType === 'status_change';
      lines.push(`Before: "${red(status ? statusText(c.beforeText) : c.beforeText)}"`, `After: "${red(status ? statusText(c.afterText) : c.afterText)}"`);
    }
    const labels = (c.details.items ?? []).slice(0, ITEM_LABELS).map((i) => red(i.label));
    if (labels.length > 0) lines.push(`Items: ${labels.join('; ')}`);
  }
  const nums = c.numericChanges
    .filter((n) => n.before || n.after)
    .map((n) => `${n.before?.raw ?? '—'} → ${n.after?.raw ?? '—'}${n.pct !== null ? ` (${n.pct > 0 ? '+' : ''}${n.pct}%)` : ''}`);
  if (nums.length > 0) lines.push(`Numbers: ${nums.join(', ')}`);
  return escapeEvidence(lines.join('\n'));
}

/** Live evidence (changes still linked with status 'event') of non-retracted events, oldest first. */
export async function loadEventEvidence(db: Db, eventIds: string[], businessNames: string[]): Promise<Map<string, EvidenceChange[]>> {
  const out = new Map<string, EvidenceChange[]>(eventIds.map((id) => [id, []]));
  if (eventIds.length === 0) return out;
  const rows = await db
    .select({ eventId: eventChange.eventId, change: detectedChange, capturedAt: capture.capturedAt, pageUrl: trackedPage.url })
    .from(eventChange)
    .innerJoin(changeEvent, eq(changeEvent.id, eventChange.eventId))
    .innerJoin(detectedChange, eq(detectedChange.id, eventChange.changeId))
    .leftJoin(capture, eq(capture.id, detectedChange.afterCaptureId))
    .leftJoin(trackedPage, eq(trackedPage.id, detectedChange.trackedPageId))
    .where(and(inArray(eventChange.eventId, eventIds), eq(detectedChange.status, 'event'), isNull(changeEvent.retractedAt)))
    .orderBy(asc(detectedChange.detectedAt), asc(detectedChange.id));
  const captureIds = [...new Set(rows.map((r) => r.change.afterCaptureId).filter((x): x is string => x !== null))];
  const ev = captureIds.length === 0 ? [] : await db.select({ id: evidence.id, captureId: evidence.captureId }).from(evidence).where(inArray(evidence.captureId, captureIds));
  for (const r of rows) {
    out.get(r.eventId)!.push({
      changeId: r.change.id, channel: r.change.source, capturedAt: r.capturedAt, pageUrl: r.pageUrl, captureId: r.change.afterCaptureId,
      evidenceIds: ev.filter((e) => e.captureId === r.change.afterCaptureId).map((e) => e.id).sort(),
      text: describe(r.change, businessNames),
    });
  }
  return out;
}
