import { capture, observation } from '@cs/db';
import { and, eq, gte, inArray, lt } from 'drizzle-orm';
import { MAX_CHANGE_ITEMS } from './ads';
import type { SourceDiffer } from './vendor-diff';

/** A posting is new only if no job pull of this competitor listed it in this many days (postings flicker between pulls). */
export const JOB_LOOKBACK_DAYS = 60;
const DAY_MS = 86_400_000;

interface JobData {
  title?: string | null;
  location?: string | null;
}

const jobLabel = (key: string, d: JobData) => [d.title, d.location].filter((x): x is string => Boolean(x)).join(' — ') || `posting ${key}`;

/** New job postings in this capture → one `hiring` change (spec §6.1 "new/removed job"; removals are noise and are not reported). */
export const diffJobs: SourceDiffer = async (db, cap) => {
  const current = await db
    .select({ key: observation.key, data: observation.data })
    .from(observation)
    .where(and(eq(observation.captureId, cap.id), eq(observation.kind, 'job_posting')));
  if (current.length === 0) return [];
  const since = new Date(cap.capturedAt.getTime() - JOB_LOOKBACK_DAYS * DAY_MS);
  const seen = await db
    .selectDistinct({ key: observation.key })
    .from(observation)
    .innerJoin(capture, eq(capture.id, observation.captureId))
    .where(
      and(
        eq(observation.competitorId, cap.competitorId), eq(observation.kind, 'job_posting'), inArray(observation.key, current.map((c) => c.key)),
        lt(capture.capturedAt, cap.capturedAt), gte(capture.capturedAt, since),
      ),
    );
  const known = new Set(seen.map((s) => s.key));
  const fresh = current.filter((j) => !known.has(j.key)).sort((a, b) => a.key.localeCompare(b.key));
  if (fresh.length === 0) return [];
  const items = fresh.slice(0, MAX_CHANGE_ITEMS).map((j) => ({ id: j.key, label: jobLabel(j.key, j.data as JobData) }));
  return [{ kind: 'added', blockKey: 'jobs:new', beforeText: null, afterText: items.map((i) => i.label).join('\n'), details: { changeType: 'hiring', count: fresh.length, items } }];
};
