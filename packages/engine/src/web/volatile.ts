import { capture, type Db, detectedChange, volatileBlock } from '@cs/db';
import { and, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { alignBlocks } from './align';
import { EXTRACT_STAGE, loadBlocks, type StoredBlock } from './blocks';
import { EXTRACTOR_VERSION } from './extract';

export const VOLATILE_TRANSITIONS = 5;
export const VOLATILE_MIN_CHANGES = 3;

/** Number of transitions in which a block's content (or presence) changed. */
export function countChanges(history: (string | null)[]): number {
  let n = 0;
  for (let i = 1; i < history.length; i++) if (history[i] !== history[i - 1]) n++;
  return n;
}

/** Spec §6.1: changed in ≥ 3 of the last 5 captures without semantic significance (no change became an event). */
export function isVolatile(history: (string | null)[], hadEvent: boolean): boolean {
  return !hadEvent && countChanges(history.slice(-(VOLATILE_TRANSITIONS + 1))) >= VOLATILE_MIN_CHANGES;
}

/** One block followed through consecutive captures by alignment (Phase 3d decision 15). */
export interface BlockChain {
  /** textSha per capture, null where the block is absent. */
  history: (string | null)[];
  /** Every block key the chain had. */
  keys: string[];
  /** Its key in the newest capture, null when it no longer exists. */
  lastKey: string | null;
}

export function blockChains(captures: StoredBlock[][]): BlockChain[] {
  const chains: BlockChain[] = [];
  let current = new Map<string, number>();
  const start = (i: number, b: StoredBlock) => {
    chains.push({ history: [...Array<null>(i).fill(null), b.textSha], keys: [b.blockKey], lastKey: b.blockKey });
    return chains.length - 1;
  };
  captures[0]?.forEach((b) => current.set(b.id, start(0, b)));
  for (let i = 1; i < captures.length; i++) {
    const next = new Map<string, number>();
    for (const a of alignBlocks(captures[i - 1]!, captures[i]!)) {
      if (a.before && a.after) {
        const c = chains[current.get(a.before.id)!]!;
        c.history.push(a.after.textSha);
        if (!c.keys.includes(a.after.blockKey)) c.keys.push(a.after.blockKey);
        c.lastKey = a.after.blockKey;
        next.set(a.after.id, current.get(a.before.id)!);
      } else if (a.after) {
        next.set(a.after.id, start(i, a.after));
      }
    }
    for (const c of chains) {
      if (c.history.length < i + 1) {
        c.history.push(null);
        c.lastKey = null;
      }
    }
    current = next;
  }
  return chains;
}

/** Keys masked automatically (a manual unmask keeps its row with unmasked_at set, so it is never auto-masked again). */
export async function maskedBlockKeys(db: Db, trackedPageId: string): Promise<Set<string>> {
  const rows = await db.select({ blockKey: volatileBlock.blockKey }).from(volatileBlock).where(and(eq(volatileBlock.trackedPageId, trackedPageId), isNull(volatileBlock.unmaskedAt)));
  return new Set(rows.map((r) => r.blockKey));
}

/** An AM's unmask (UI in Phase 5): the block is diffed normally from now on and never auto-masked again. */
export async function unmaskBlock(db: Db, trackedPageId: string, blockKey: string): Promise<void> {
  await db
    .insert(volatileBlock)
    .values({ trackedPageId, blockKey, unmaskedAt: new Date() })
    .onConflictDoUpdate({ target: [volatileBlock.trackedPageId, volatileBlock.blockKey], set: { unmaskedAt: sql`now()` } });
}

export async function learnVolatileBlocks(db: Db, trackedPageId: string): Promise<{ masked: string[]; unmasked: string[] }> {
  const caps = await db
    .select({ id: capture.id })
    .from(capture)
    .where(
      and(
        eq(capture.trackedPageId, trackedPageId), eq(capture.source, 'web'), eq(capture.status, 'ok'),
        // Only captures extracted under the current extractor: mixing versions would look like churn (3a carry-over).
        sql`EXISTS (SELECT 1 FROM stage_run s WHERE s.stage = ${EXTRACT_STAGE} AND s.stage_version = ${EXTRACTOR_VERSION}::int AND s.subject_id = ${capture.id} AND s.status = 'done')`,
      ),
    )
    .orderBy(desc(capture.capturedAt))
    .limit(VOLATILE_TRANSITIONS + 1);
  if (caps.length < VOLATILE_MIN_CHANGES + 1) return { masked: [], unmasked: [] };
  const ids = caps.map((c) => c.id).reverse();
  const chains = blockChains(await Promise.all(ids.map((id) => loadBlocks(db, id))));

  // A block with an event is never masked. A change still pending also protects it (not yet tagged, may still
  // matter) — except the capture just diffed this call, whose own change is inherently fresh-pending at this
  // instant (learnVolatileBlocks runs immediately after diffWebCapture writes it); only an EARLIER evaluation's
  // still-unresolved pending change should block this one.
  const priorIds = ids.slice(0, -1);
  const protectedKeys = new Set(
    (
      await db
        .select({ blockKey: detectedChange.blockKey })
        .from(detectedChange)
        .where(
          and(
            eq(detectedChange.trackedPageId, trackedPageId),
            or(
              and(eq(detectedChange.status, 'event'), inArray(detectedChange.afterCaptureId, ids)),
              and(eq(detectedChange.status, 'pending'), inArray(detectedChange.afterCaptureId, priorIds)),
            ),
          ),
        )
    ).map((r) => r.blockKey),
  );
  const rows = await db.select().from(volatileBlock).where(eq(volatileBlock.trackedPageId, trackedPageId));
  const masked = new Set(rows.filter((r) => r.unmaskedAt === null).map((r) => r.blockKey));
  const manual = new Set(rows.filter((r) => r.unmaskedAt !== null).map((r) => r.blockKey));
  const live = chains.filter((c) => c.lastKey !== null);
  const liveKeys = new Set(live.map((c) => c.lastKey!));

  const newly = live
    .filter((c) => !masked.has(c.lastKey!) && !manual.has(c.lastKey!) && isVolatile(c.history, c.keys.some((k) => protectedKeys.has(k))))
    .map((c) => c.lastKey!);
  const fullWindow = ids.length === VOLATILE_TRANSITIONS + 1;
  const expired = [...masked].filter((k) => {
    if (!liveKeys.has(k)) return true; // no block carries this key any more
    const c = live.find((x) => x.lastKey === k)!;
    return fullWindow && countChanges(c.history) === 0;
  });

  if (newly.length > 0) await db.insert(volatileBlock).values(newly.map((blockKey) => ({ trackedPageId, blockKey }))).onConflictDoNothing();
  if (expired.length > 0) await db.delete(volatileBlock).where(and(eq(volatileBlock.trackedPageId, trackedPageId), inArray(volatileBlock.blockKey, expired), isNull(volatileBlock.unmaskedAt)));
  return { masked: newly, unmasked: expired };
}
