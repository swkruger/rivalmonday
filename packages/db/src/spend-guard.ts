import { eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Db, Tx } from './client';
import { platformSetting } from './schema/billing';

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
