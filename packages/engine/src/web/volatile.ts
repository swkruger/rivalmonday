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
  /** The chain's key at each capture, null where absent — which chain held a given key at which capture. */
  keyHistory: (string | null)[];
}

export function blockChains(captures: StoredBlock[][]): BlockChain[] {
  const chains: BlockChain[] = [];
  let current = new Map<string, number>();
  const start = (i: number, b: StoredBlock) => {
    chains.push({
      history: [...Array<null>(i).fill(null), b.textSha],
      keys: [b.blockKey],
      lastKey: b.blockKey,
      keyHistory: [...Array<null>(i).fill(null), b.blockKey],
    });
    return chains.length - 1;
  };
  captures[0]?.forEach((b) => current.set(b.id, start(0, b)));
  for (let i = 1; i < captures.length; i++) {
    const next = new Map<string, number>();
    for (const a of alignBlocks(captures[i - 1]!, captures[i]!)) {
      if (a.before && a.after) {
        const c = chains[current.get(a.before.id)!]!;
        c.history.push(a.after.textSha);
        c.keyHistory.push(a.after.blockKey);
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
        c.keyHistory.push(null);
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

/** The page's newest ok web captures extracted under the current extractor, newest first. */
async function windowCaptureIds(db: Db, trackedPageId: string, limit: number): Promise<string[]> {
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
    .limit(limit);
  return caps.map((c) => c.id);
}

/** An AM's unmask (UI in Phase 5): the block is diffed normally from now on and never auto-masked again. */
export async function unmaskBlock(db: Db, trackedPageId: string, blockKey: string): Promise<void> {
  // The AM unmasks the block at the key it has NOW: pin the row to the newest capture the learner can see, so
  // it resolves to that block's chain exactly like an automatic row (null only when nothing is extracted yet).
  const [keyCaptureId = null] = await windowCaptureIds(db, trackedPageId, 1);
  await db
    .insert(volatileBlock)
    .values({ trackedPageId, blockKey, unmaskedAt: sql`now()`, keyCaptureId })
    .onConflictDoUpdate({ target: [volatileBlock.trackedPageId, volatileBlock.blockKey], set: { unmaskedAt: sql`now()`, keyCaptureId } });
}

export async function learnVolatileBlocks(db: Db, trackedPageId: string): Promise<{ masked: string[]; unmasked: string[] }> {
  const newestFirst = await windowCaptureIds(db, trackedPageId, VOLATILE_TRANSITIONS + 1);
  if (newestFirst.length < VOLATILE_MIN_CHANGES + 1) return { masked: [], unmasked: [] };
  const ids = newestFirst.reverse();
  const newestId = ids.at(-1)!;
  const chains = blockChains(await Promise.all(ids.map((id) => loadBlocks(db, id))));

  // A key is only meaningful relative to the capture it was recorded against — positions are reused by
  // different blocks over the life of a window, so a bare key string can match the WRONG chain at a
  // DIFFERENT time than the one a row (automatic mask, manual unmask, or detected change) actually meant.
  // Every lookup below resolves through chainAt at the specific capture index the row is pinned to, landing
  // on exactly one chain, never on "whichever chain happens to share that key string at some other moment."
  const chainAt = (idx: number, k: string): BlockChain | undefined => chains.find((c) => c.keyHistory[idx] === k);
  // A row pinned to a capture outside the window (or to none) resolves against the window's oldest capture.
  const rowChain = (row: { blockKey: string; keyCaptureId: string | null }) => {
    const idx = row.keyCaptureId ? ids.indexOf(row.keyCaptureId) : -1;
    return chainAt(idx >= 0 ? idx : 0, row.blockKey);
  };

  // A block with an event is never masked (full window: an event is a finished decision, recency doesn't
  // matter). A change still pending also protects it (not yet tagged, may still matter) — except the capture
  // just diffed this call, whose own change is inherently fresh-pending at this instant (learnVolatileBlocks
  // runs immediately after diffWebCapture writes it); only an EARLIER evaluation's still-unresolved pending
  // change should block this one.
  const priorIds = ids.slice(0, -1);
  const protectedRows = await db
    .select({
      kind: detectedChange.kind, blockKey: detectedChange.blockKey, status: detectedChange.status,
      beforeCaptureId: detectedChange.beforeCaptureId, afterCaptureId: detectedChange.afterCaptureId,
    })
    .from(detectedChange)
    .where(
      and(
        eq(detectedChange.trackedPageId, trackedPageId),
        or(
          and(eq(detectedChange.status, 'event'), inArray(detectedChange.afterCaptureId, ids)),
          and(eq(detectedChange.status, 'pending'), inArray(detectedChange.afterCaptureId, priorIds)),
        ),
      ),
    );
  const eventChains = new Set<BlockChain>();
  const protectedChains = new Set<BlockChain>(); // event OR a still-pending change from an earlier evaluation
  for (const r of protectedRows) {
    const afterIdx = r.afterCaptureId ? ids.indexOf(r.afterCaptureId) : -1;
    // A removal is recorded under the removed block's BEFORE key (diff-stage), which another block may occupy
    // at the after capture — so it resolves at the before capture (the one just before the after capture when
    // the before capture is unknown to this window).
    let capIdx = afterIdx;
    if (r.kind === 'removed') {
      const beforeIdx = r.beforeCaptureId ? ids.indexOf(r.beforeCaptureId) : -1;
      capIdx = beforeIdx >= 0 ? beforeIdx : afterIdx - 1;
    }
    const c = capIdx >= 0 && r.blockKey ? chainAt(capIdx, r.blockKey) : undefined;
    if (!c) continue;
    protectedChains.add(c);
    if (r.status === 'event') eventChains.add(c);
  }

  const rows = await db.select().from(volatileBlock).where(eq(volatileBlock.trackedPageId, trackedPageId));
  const oldRows = rows.filter((r) => r.unmaskedAt === null); // automatic masks: the only rows this function ever writes
  const manualRows = rows.filter((r) => r.unmaskedAt !== null);
  const manualKeys = new Set(manualRows.map((r) => r.blockKey)); // never written to, whichever chain claims the string
  // A manual row is pinned (by unmaskBlock) to the capture whose key the AM unmasked, and resolves exactly like
  // an automatic row.
  const manualChains = new Set(manualRows.map(rowChain).filter((c): c is BlockChain => c != null));
  const live = chains.filter((c) => c.lastKey !== null);
  const fullWindow = ids.length === VOLATILE_TRANSITIONS + 1;

  const finalKeys = new Set<string>();
  for (const row of oldRows) {
    const c = rowChain(row);
    const stable = c != null && fullWindow && countChanges(c.history) === 0;
    // Dropped when dead, gone from this window, manually cleared, eventful, or fully stable.
    if (!c || c.lastKey === null || manualChains.has(c) || eventChains.has(c) || stable) continue;
    finalKeys.add(c.lastKey); // same key (refreshed) or moved — either way, this is where it lives now
  }

  // A block never gets a fresh automatic mask while its chain is already accounted for above (whatever key it
  // now sits at) or was manually unmasked (an AM's call stands forever).
  for (const c of live) {
    if (!finalKeys.has(c.lastKey!) && !manualChains.has(c) && isVolatile(c.history, protectedChains.has(c))) finalKeys.add(c.lastKey!);
  }
  // A key string holds one row only: a manual row's key is never written, whichever chain now sits there.
  for (const k of manualKeys) finalKeys.delete(k);

  // Apply the whole relocation — deletes of keys no longer in the final set, upserts of every key that is —
  // in one transaction. A key in the final set is never deleted, even if it is also some OTHER row's old key
  // (adjacent masked blocks can shift into each other's old positions in the same call). Manual rows are
  // never touched: deletes only ever target automatic rows, and finalKeys never contains a manual key.
  const oldKeys = oldRows.map((r) => r.blockKey);
  const toDelete = oldKeys.filter((k) => !finalKeys.has(k));
  const masked = [...finalKeys].filter((k) => !oldKeys.includes(k));
  await db.transaction(async (tx) => {
    if (toDelete.length > 0) {
      await tx.delete(volatileBlock).where(and(eq(volatileBlock.trackedPageId, trackedPageId), inArray(volatileBlock.blockKey, toDelete), isNull(volatileBlock.unmaskedAt)));
    }
    if (finalKeys.size > 0) {
      await tx
        .insert(volatileBlock)
        .values([...finalKeys].map((blockKey) => ({ trackedPageId, blockKey, keyCaptureId: newestId })))
        .onConflictDoUpdate({ target: [volatileBlock.trackedPageId, volatileBlock.blockKey], set: { keyCaptureId: newestId }, setWhere: isNull(volatileBlock.unmaskedAt) });
    }
  });
  // The returned lists describe the rows: keys that stopped being masked, and keys that became masked.
  return { masked, unmasked: toDelete };
}
