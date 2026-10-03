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

/** An AM's unmask (UI in Phase 5): the block is diffed normally from now on and never auto-masked again. */
export async function unmaskBlock(db: Db, trackedPageId: string, blockKey: string): Promise<void> {
  await db
    .insert(volatileBlock)
    .values({ trackedPageId, blockKey, unmaskedAt: sql`now()` })
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

  // A block with an event is never masked (full window: an event is a finished decision, recency doesn't
  // matter). A change still pending also protects it (not yet tagged, may still matter) — except the capture
  // just diffed this call, whose own change is inherently fresh-pending at this instant (learnVolatileBlocks
  // runs immediately after diffWebCapture writes it); only an EARLIER evaluation's still-unresolved pending
  // change should block this one.
  const priorIds = ids.slice(0, -1);
  const protectedRows = await db
    .select({ blockKey: detectedChange.blockKey, status: detectedChange.status })
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
  const eventKeys = new Set(protectedRows.filter((r) => r.status === 'event').map((r) => r.blockKey));
  const protectedKeys = new Set(protectedRows.map((r) => r.blockKey));

  const rows = await db.select().from(volatileBlock).where(eq(volatileBlock.trackedPageId, trackedPageId));
  const masked = new Set(rows.filter((r) => r.unmaskedAt === null).map((r) => r.blockKey));
  const manual = new Set(rows.filter((r) => r.unmaskedAt !== null).map((r) => r.blockKey));
  const live = chains.filter((c) => c.lastKey !== null);

  // A block never gets a fresh automatic mask while any key its chain has ever held is already masked (it's
  // being tracked below, possibly under an older key) or was manually unmasked (an AM's call stands forever).
  const newly = live
    .filter((c) => !c.keys.some((k) => manual.has(k) || masked.has(k)) && isVolatile(c.history, c.keys.some((k) => protectedKeys.has(k))))
    .map((c) => c.lastKey!);

  // Resolve a masked key k to the chain that holds (or most recently held) it — not just any chain whose
  // history ever passed through k, and not just the first one created. The same key value passes through
  // several different chains over the life of a window (an adjacent block can arrive at it from elsewhere
  // just as easily as its original holder can leave it — e.g. a removal above a run of blocks shifts EVERY
  // one of them up by one key at once), so neither "first chain created" nor "chain with the single latest
  // occurrence" is a safe rule on its own:
  //  1. If a chain was already sitting at k at the very start of this window and is still alive (however far
  //     it has since moved), it IS k's owner — prefer it outright, even over a chain that currently sits at k
  //     having arrived there later from somewhere else (that arrival is coincidence of position, not identity).
  //  2. Otherwise (k's original window-start holder has died, or nothing held k at window-start at all) fall
  //     back to whichever chain most recently held k — excluding a chain that sprang into existence already
  //     holding k (no earlier capture in this window shows it at all): that one inherited a vacated position
  //     rather than being the block k used to represent, the mirror of the separately-tracked alignBlocks
  //     same-key pairing issue — this guards our own bookkeeping when alignBlocks does keep chains apart.
  const chainForKey = (k: string): BlockChain | undefined => {
    const rooted = chains.find((c) => c.keyHistory[0] === k);
    if (rooted?.lastKey != null) return rooted;
    let best: BlockChain | undefined;
    let bestIdx = -1;
    for (const c of chains) {
      const firstLiveIdx = c.keyHistory.findIndex((key) => key !== null);
      if (firstLiveIdx > 0 && c.keyHistory[firstLiveIdx] === k) continue;
      const idx = c.keyHistory.lastIndexOf(k);
      if (idx > bestIdx) {
        bestIdx = idx;
        best = c;
      }
    }
    return best;
  };

  // Existing masks follow their block, not its position: resolve each masked key k to the chain that carries
  // it and decide from THAT chain's current state — move the mask to its current key if the key shifted (an
  // insertion/removal elsewhere renumbered it), or lift it (expire) when the block has gone fully stable for
  // the whole window, was tied to a change that turned out to be an event, reached a key an AM manually
  // unmasked, or no chain carries it any more at all (the window has aged past where it ever existed).
  const fullWindow = ids.length === VOLATILE_TRANSITIONS + 1;
  const expired: string[] = [];
  const moved: { from: string; to: string }[] = [];
  for (const k of masked) {
    const c = chainForKey(k);
    if (!c) {
      expired.push(k); // no chain in this window ever carried this key
      continue;
    }
    const manualChain = c.keys.some((key) => manual.has(key));
    const eventChain = c.keys.some((key) => eventKeys.has(key));
    const stable = fullWindow && countChanges(c.history) === 0;
    if (manualChain || eventChain || stable || c.lastKey === null) {
      expired.push(k);
      continue;
    }
    if (c.lastKey !== k) moved.push({ from: k, to: c.lastKey });
  }

  if (newly.length > 0) await db.insert(volatileBlock).values(newly.map((blockKey) => ({ trackedPageId, blockKey }))).onConflictDoNothing();
  if (moved.length > 0) {
    // Adjacent blocks can shift together (e.g. a removal above both moves k2→k1 AND k1→k0 in the same call):
    // a key can be both a "from" and a "to" in the same batch. Only delete a "from" key that ISN'T also a
    // "to" of this batch, or the insert-then-delete would wipe out a position another move just landed on.
    // Both writes run in one transaction so the relocation is never observed half-applied.
    const toKeys = new Set(moved.map((m) => m.to));
    const deleteFrom = moved.map((m) => m.from).filter((from) => !toKeys.has(from));
    await db.transaction(async (tx) => {
      await tx.insert(volatileBlock).values(moved.map((m) => ({ trackedPageId, blockKey: m.to }))).onConflictDoNothing();
      if (deleteFrom.length > 0) {
        await tx.delete(volatileBlock).where(and(eq(volatileBlock.trackedPageId, trackedPageId), inArray(volatileBlock.blockKey, deleteFrom), isNull(volatileBlock.unmaskedAt)));
      }
    });
  }
  if (expired.length > 0) await db.delete(volatileBlock).where(and(eq(volatileBlock.trackedPageId, trackedPageId), inArray(volatileBlock.blockKey, expired), isNull(volatileBlock.unmaskedAt)));
  return { masked: newly, unmasked: expired };
}
