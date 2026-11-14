import type { AiDecisionMode } from '@cs/core';
import { and, eq, gte, like, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Db, Tx } from './client';
import { llmCall } from './schema/ledger';
import { platformSetting } from './schema/billing';

/** `platform_setting` key (seeded by the 18e migration: `{ mode: 'jev_only', reevalUntil: null }`). */
export const AI_DECISION_MODE_KEY = 'ai_decision_mode';

export const AiDecisionModeSchema = z.object({
  mode: z.enum(['jev_only', 'cascade']),
  reevalUntil: z.string().datetime({ offset: true }).nullable(),
  /** Start of the active (or expired, never stopped) re-evaluation window; absent on rows written before it was kept. */
  reevalFrom: z.string().datetime({ offset: true }).nullable().optional(),
  /** The most recent stopped window. */
  lastWindow: z.object({ from: z.string().datetime({ offset: true }), to: z.string().datetime({ offset: true }) }).nullable().optional(),
});

/** The stored value including the window bookkeeping the staff card reads (`readAiDecisionMode` stays mode + reevalUntil). */
export type AiDecisionState = AiDecisionMode & { reevalFrom: string | null; lastWindow: { from: string; to: string } | null };

const CASCADE: AiDecisionMode = { mode: 'cascade', reevalUntil: null };

/** Missing row or failed parse: cascade (today's behaviour). */
export async function readAiDecisionMode(db: Db | Tx): Promise<AiDecisionMode> {
  const [row] = await db.select({ value: platformSetting.value }).from(platformSetting).where(eq(platformSetting.key, AI_DECISION_MODE_KEY));
  const parsed = AiDecisionModeSchema.safeParse(row?.value);
  return parsed.success ? { mode: parsed.data.mode, reevalUntil: parsed.data.reevalUntil } : { ...CASCADE };
}

/** Full stored state (window bounds included); missing row or failed parse: cascade with no window. */
export async function readAiDecisionState(db: Db | Tx, lock = false): Promise<AiDecisionState> {
  const q = db.select({ value: platformSetting.value }).from(platformSetting).where(eq(platformSetting.key, AI_DECISION_MODE_KEY));
  const [row] = await (lock ? q.for('update') : q);
  const parsed = AiDecisionModeSchema.safeParse(row?.value);
  return parsed.success ? { ...parsed.data, reevalFrom: parsed.data.reevalFrom ?? null, lastWindow: parsed.data.lastWindow ?? null } : { ...CASCADE, reevalFrom: null, lastWindow: null };
}

/** Atomic read-modify-write of the stored state (`SELECT ... FOR UPDATE` on the setting row inside one transaction). */
export async function updateAiDecisionState(db: Db, change: (prev: AiDecisionState) => AiDecisionState, by: string): Promise<AiDecisionState> {
  return db.transaction(async (tx) => {
    const next = change(await readAiDecisionState(tx, true));
    await writeAiDecisionMode(tx, next, by);
    return next;
  });
}

export async function writeAiDecisionMode(db: Db | Tx, value: AiDecisionMode & Partial<Pick<AiDecisionState, 'reevalFrom' | 'lastWindow'>>, by: string): Promise<void> {
  const v = AiDecisionModeSchema.parse(value);
  await db
    .insert(platformSetting)
    .values({ key: AI_DECISION_MODE_KEY, value: v, updatedBy: by })
    .onConflictDoUpdate({ target: platformSetting.key, set: { value: v, updatedBy: by, updatedAt: new Date() } });
}

/** Cached read (default 30 s). A failed read answers cascade (never jev-only by accident) and is not cached. */
export function createDecisionModeReader(db: Db, opts: { ttlMs?: number; now?: () => number } = {}): () => Promise<AiDecisionMode> {
  const ttlMs = opts.ttlMs ?? 30_000;
  const now = opts.now ?? Date.now;
  let hit: { value: AiDecisionMode; until: number } | null = null;
  return async () => {
    const t = now();
    if (hit && t < hit.until) return hit.value;
    try {
      const value = await readAiDecisionMode(db);
      hit = { value, until: t + ttlMs };
      return value;
    } catch {
      return { ...CASCADE };
    }
  };
}

/**
 * Re-evaluation LLM calls ledgered today (UTC): `llm_call.task LIKE '%:reeval'`. Cached `ttlMs`; `bump()` adds a call this
 * process started (reset on refresh, when the ledger rows include it). A failed read answers Infinity (no extra spend).
 */
export function createReevalCallCounter(db: Db, opts: { ttlMs?: number; now?: () => number } = {}): { count(): Promise<number>; bump(): void } {
  const ttlMs = opts.ttlMs ?? 30_000;
  const now = opts.now ?? Date.now;
  let hit: { value: number; until: number } | null = null;
  let bumps = 0;
  return {
    bump() {
      bumps += 1;
    },
    async count() {
      const t = now();
      if (hit && t < hit.until) return hit.value + bumps;
      try {
        const d = new Date(t);
        const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
        const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(llmCall).where(and(like(llmCall.task, '%:reeval'), gte(llmCall.createdAt, start)));
        hit = { value: row?.n ?? 0, until: t + ttlMs };
        bumps = 0;
        return hit.value;
      } catch {
        return Number.POSITIVE_INFINITY;
      }
    },
  };
}

/** The `Ai` deps bundle: cached mode reader plus the capped re-eval counter. */
export function createDecisionModeSource(db: Db, opts: { ttlMs?: number; now?: () => number } = {}) {
  const counter = createReevalCallCounter(db, opts);
  return { read: createDecisionModeReader(db, opts), reevalCallsToday: counter.count, noteReevalCall: counter.bump };
}
