import { AiPausedError, type AiGuard, type CallScope } from '@cs/core';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Db, Tx } from './client';
import { platformSetting } from './schema/billing';
import { client } from './schema/tenancy';

/** `platform_setting` keys (seeded by migration 0086). Platform staff only (7b1). */
export const SPEND_GUARD_SETTINGS_KEY = 'spend_guard_settings';
export const AI_GUARD_STATE_KEY = 'ai_guard_state';

/** Spec 2026-10-22 §4: `{}` parses to the defaults. */
export const SpendGuardSettings = z
  .object({
    creditsPerUsd: z.number().int().min(1).max(10_000).default(100),
    clientMonthlyLimitUsd: z.number().min(1).max(10_000).default(15),
    clientPausePercent: z.number().int().min(100).max(1_000).default(130),
    spikeWarnPercent: z.number().int().min(10).max(1_000).default(100),
    spikePausePercent: z.number().int().min(20).max(2_000).default(200),
    spikeFloorUsdPerDay: z.number().min(0).max(10_000).default(5),
    spikeFloorUsdPerClientDay: z.number().min(0).max(100).default(0.5),
    spikeSnoozeHours: z.number().int().min(1).max(168).default(24),
  })
  .refine((s) => s.spikePausePercent > s.spikeWarnPercent);
export type SpendGuardSettings = z.infer<typeof SpendGuardSettings>;

export const AiGuardState = z.object({
  state: z.enum(['ok', 'warn', 'paused']),
  since: z.string().datetime().optional(),
  scope: z.enum(['total', 'openrouter', 'anthropic']).optional(),
  observedUsd: z.number().optional(),
  baselineUsd: z.number().optional(),
  snoozeUntil: z.string().datetime().optional(),
  resetBy: z.string().optional(),
});
export type AiGuardState = z.infer<typeof AiGuardState>;

const warned = new Set<string>();
function warnOnce(key: string, detail: unknown): void {
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(`[spend-guard] ${key} is invalid; using defaults`, detail);
}

async function readValue(db: Db | Tx, key: string): Promise<unknown> {
  const [row] = await db.select({ value: platformSetting.value }).from(platformSetting).where(eq(platformSetting.key, key));
  return row?.value;
}

/** Missing row or failed parse: the spec defaults (logged once per process). */
export async function readSpendGuardSettings(db: Db | Tx): Promise<SpendGuardSettings> {
  const value = await readValue(db, SPEND_GUARD_SETTINGS_KEY);
  const parsed = SpendGuardSettings.safeParse(value ?? {});
  if (parsed.success) return parsed.data;
  warnOnce(SPEND_GUARD_SETTINGS_KEY, parsed.error.issues);
  return SpendGuardSettings.parse({});
}

/** Missing row or failed parse: `{ state: 'ok' }`. */
export async function readAiGuardState(db: Db | Tx): Promise<AiGuardState> {
  const value = await readValue(db, AI_GUARD_STATE_KEY);
  if (value === undefined) return { state: 'ok' };
  const parsed = AiGuardState.safeParse(value);
  if (parsed.success) return parsed.data;
  warnOnce(AI_GUARD_STATE_KEY, parsed.error.issues);
  return { state: 'ok' };
}

export async function writeAiGuardState(db: Db | Tx, s: AiGuardState, by: string): Promise<void> {
  const value = AiGuardState.parse(s);
  await db
    .insert(platformSetting)
    .values({ key: AI_GUARD_STATE_KEY, value, updatedBy: by })
    .onConflictDoUpdate({ target: platformSetting.key, set: { value, updatedBy: by, updatedAt: new Date() } });
}

/** The client's monthly limit in USD: its override, else the platform default. */
export function effectiveLimitUsd(spendLimitUsd: string | number | null, s: SpendGuardSettings): number {
  return spendLimitUsd === null ? s.clientMonthlyLimitUsd : Number(spendLimitUsd);
}

/** Spend at or above which the client's AI/recurring work is auto-paused (`limit × clientPausePercent / 100`). */
export function pauseThresholdUsd(limitUsd: number, s: SpendGuardSettings): number {
  return (limitUsd * s.clientPausePercent) / 100;
}

const GUARD_CACHE_MS = 30_000;
const GUARD_LOG_EVERY_MS = 60_000;
const GUARD_CLIENT_CACHE_MAX = 5_000;

/**
 * Refuses AI work while the platform (`ai_guard_state.state === 'paused'`) or the call's client (`client.spend_paused_at`)
 * is spend-paused. `warn` never refuses. Reads are cached `cacheMs` (platform state once, clients per id). A failed read
 * fails OPEN (a DB blip must not stop all AI; the hourly job re-asserts the pause) and logs one error a minute, with the
 * error name only (never the message: it can carry query params).
 */
export function createAiGuard(db: Db, opts: { cacheMs?: number; now?: () => number } = {}): AiGuard {
  const cacheMs = opts.cacheMs ?? GUARD_CACHE_MS;
  const now = opts.now ?? Date.now;
  let platform: { paused: boolean; until: number } | null = null;
  const clients = new Map<string, { paused: boolean; until: number }>();
  let lastLogged = -Infinity;

  async function platformPaused(): Promise<boolean> {
    const t = now();
    if (platform && t < platform.until) return platform.paused;
    const paused = (await readAiGuardState(db)).state === 'paused';
    platform = { paused, until: t + cacheMs };
    return paused;
  }

  async function clientPaused(clientId: string): Promise<boolean> {
    const t = now();
    const hit = clients.get(clientId);
    if (hit && t < hit.until) return hit.paused;
    const [row] = await db.select({ at: client.spendPausedAt }).from(client).where(eq(client.id, clientId));
    const paused = row?.at != null;
    if (clients.size >= GUARD_CLIENT_CACHE_MAX) clients.clear();
    clients.set(clientId, { paused, until: t + cacheMs });
    return paused;
  }

  return {
    async assertAllowed(scope: CallScope): Promise<void> {
      let reason: 'platform' | 'client' | null = null;
      try {
        if (await platformPaused()) reason = 'platform';
        else if (scope.clientId && (await clientPaused(scope.clientId))) reason = 'client';
      } catch (err) {
        const t = now();
        if (t - lastLogged >= GUARD_LOG_EVERY_MS) {
          lastLogged = t;
          // eslint-disable-next-line no-console -- operators must see that the guard is failing open
          console.error('[ai-guard] state read failed; allowing the call', { error: err instanceof Error ? err.name : typeof err });
        }
        return;
      }
      if (reason) throw new AiPausedError(reason);
    },
  };
}
