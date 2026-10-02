import { capture, type ChangeDetails, type Db, detectedChange } from '@cs/db';
import { and, desc, eq, isNull, lt } from 'drizzle-orm';
import { runStage, type StageOutcome } from '../stage';
import { diffAds } from './ads';
import { diffGbp } from './gbp';
import { diffJobs } from './jobs';

export const VENDOR_DIFF_STAGE = 'vendor_diff';
export const VENDOR_DIFF_VERSION = 1;
/**
 * Collectors record the capture row first and write ads/reviews/jobs/GBP rows afterwards, so a vendor
 * capture is diffed only once it is this old — an immediate diff would see nothing and mark it done.
 */
export const VENDOR_SETTLE_MINUTES = 10;

export interface StructuredChange {
  kind: 'added' | 'removed' | 'modified';
  blockKey: string;
  beforeText: string | null;
  afterText: string | null;
  details: ChangeDetails;
}

export type CaptureRow = typeof capture.$inferSelect;
/** Compares a vendor capture with the previous ok capture of the same competitor, source and url. Never calls a model. */
export type SourceDiffer = (db: Db, cap: CaptureRow, prev: CaptureRow) => Promise<StructuredChange[]>;

/** Capture sources with a structured differ. Only these are swept, so a source without one is never marked done. */
const DIFFERS: Record<string, SourceDiffer> = {
  google_ads: diffAds,
  meta_ads: diffAds,
  google_business_profile: diffGbp,
  google_jobs: diffJobs,
};

export const vendorDiffSources = (): string[] => Object.keys(DIFFERS);

/** The latest earlier ok capture of the same competitor, source and url (Meta captures are per page). */
export async function previousVendorCapture(db: Db, cap: CaptureRow): Promise<CaptureRow | null> {
  const [prev] = await db
    .select()
    .from(capture)
    .where(
      and(
        eq(capture.competitorId, cap.competitorId), eq(capture.source, cap.source), eq(capture.status, 'ok'),
        cap.url === null ? isNull(capture.url) : eq(capture.url, cap.url), lt(capture.capturedAt, cap.capturedAt),
      ),
    )
    .orderBy(desc(capture.capturedAt))
    .limit(1);
  return prev ?? null;
}

/** Spec §6.1 structured sources: set differences between two vendor captures → detected changes. The first capture is a silent baseline. */
export async function diffVendorCapture(
  deps: { db: Db },
  captureId: string,
  opts: { now?: Date } = {},
): Promise<StageOutcome<{ baseline: boolean; changeIds: string[] }>> {
  const [cap] = await deps.db.select().from(capture).where(eq(capture.id, captureId)).limit(1);
  const differ = cap ? DIFFERS[cap.source] : undefined;
  if (!cap || cap.status !== 'ok' || !differ) throw new Error(`capture ${captureId} is not an ok vendor capture with a structured differ`);
  const now = opts.now ?? new Date();
  if (now.getTime() - cap.capturedAt.getTime() < VENDOR_SETTLE_MINUTES * 60_000) return { ran: false };
  return runStage(
    deps.db,
    { stage: VENDOR_DIFF_STAGE, version: VENDOR_DIFF_VERSION, subjectId: captureId },
    async () => {
      const prev = await previousVendorCapture(deps.db, cap);
      return { prev, changes: prev ? await differ(deps.db, cap, prev) : [] };
    },
    async (tx, { prev, changes }) => {
      if (!prev || changes.length === 0) return { baseline: prev === null, changeIds: [] as string[] };
      const rows = await tx
        .insert(detectedChange)
        .values(
          changes.map((c) => ({
            competitorId: cap.competitorId, source: cap.source, kind: c.kind, beforeCaptureId: prev.id, afterCaptureId: cap.id,
            blockKey: c.blockKey, beforeText: c.beforeText, afterText: c.afterText, details: c.details, stageVersion: VENDOR_DIFF_VERSION,
          })),
        )
        .onConflictDoNothing()
        .returning({ id: detectedChange.id });
      return { baseline: false, changeIds: rows.map((r) => r.id) };
    },
  );
}
