import { type AccessContext, ToolError, toolkit } from '@cs/core';
import {
  agency, AiGuardState, client, lockAiGuardState, effectiveLimitUsd, monthStart, platformSetting, readAiGuardState, readSpendGuardSettings, SPEND_GUARD_SETTINGS_KEY,
  SpendGuardSettings, spendByClient, spendGuardEvent, writeAiGuardState,
} from '@cs/db';
import { and, desc, eq, isNotNull, isNull } from 'drizzle-orm';
import { z } from 'zod';
import type { ToolDeps } from '../deps';
import { requirePlatformOperator } from '../platform';
import { withPlatformAudit } from '../platform/audit';
import { readSpikes } from '../spend-guard';

/**
 * 7b1 d9-d12: platform AI spike guard views and controls. Platform staff only (anything else is hidden as 404), web only,
 * audited by `withPlatformAudit`. Dollars are allowed here (staff channel); nothing tenant-facing uses these tools.
 */
const { defineTool } = toolkit<ToolDeps>();
const EVENTS_LIMIT = 50;
const HOUR_MS = 3_600_000;

async function requireGuardOperator(deps: ToolDeps, ctx: AccessContext, min: 'viewer' | 'staff' | 'owner') {
  try {
    return await requirePlatformOperator(deps, ctx, min);
  } catch (err) {
    if (err instanceof ToolError && err.code === 'permission_denied') throw new ToolError('not_found', 'Not found');
    throw err;
  }
}

const Settings = z.object({
  creditsPerUsd: z.number(),
  clientMonthlyLimitUsd: z.number(),
  clientPausePercent: z.number(),
  spikeWarnPercent: z.number(),
  spikePausePercent: z.number(),
  spikeFloorUsdPerDay: z.number(),
  spikeFloorUsdPerClientDay: z.number(),
  spikeSnoozeHours: z.number(),
});
const GuardState = z.object({
  state: z.enum(['ok', 'warn', 'paused']),
  since: z.string().optional(),
  scope: z.enum(['total', 'openrouter', 'anthropic']).optional(),
  observedUsd: z.number().optional(),
  baselineUsd: z.number().optional(),
  snoozeUntil: z.string().optional(),
  resetBy: z.string().optional(),
});
const Reading = z.object({
  scope: z.enum(['total', 'openrouter', 'anthropic']),
  observedUsd: z.number(),
  baselineUsd: z.number(),
  ratioPercent: z.number(),
  floorOnly: z.boolean(),
});
const PausedClient = z.object({
  clientId: z.string(),
  clientName: z.string(),
  agencyId: z.string(),
  agencyName: z.string(),
  spendPausedAt: z.string(),
  spendUsd: z.number(),
  limitUsd: z.number(),
});
const EventView = z.object({
  id: z.string(),
  kind: z.string(),
  createdAt: z.string(),
  agencyId: z.string().nullable(),
  clientId: z.string().nullable(),
  scope: z.string().nullable(),
  observedUsd: z.number().nullable(),
  baselineUsd: z.number().nullable(),
  limitUsd: z.number().nullable(),
  actor: z.string(),
  note: z.string().nullable(),
});
export type SpendGuardEventView = z.infer<typeof EventView>;

export const getSpendGuard = defineTool({
  name: 'get_spend_guard',
  access: 'read',
  description: 'Platform operators: the AI spend guard settings, state, spike readings per scope, spend-paused clients and the last 50 guard events.',
  input: z.object({}),
  output: z.object({ settings: Settings, state: GuardState, scopes: z.array(Reading), pausedClients: z.array(PausedClient), events: z.array(EventView) }),
  permission: 'agency',
  audit: 'skip-web',
  supportHidden: true,
  async handler(ctx: AccessContext, input, deps) {
    const role = await requireGuardOperator(deps, ctx, 'viewer');
    return withPlatformAudit(deps, ctx, { tool: 'get_spend_guard', input, role }, async () => {
      const now = new Date();
      const settings = await readSpendGuardSettings(deps.service);
      const [state, scopes, paused, events] = await Promise.all([
        readAiGuardState(deps.service),
        readSpikes(deps.service, now, settings),
        deps.service
          .select({ id: client.id, name: client.name, agencyId: client.agencyId, agencyName: agency.name, limit: client.spendLimitUsd, at: client.spendPausedAt })
          .from(client)
          .innerJoin(agency, eq(agency.id, client.agencyId))
          .where(and(isNotNull(client.spendPausedAt), isNull(client.archivedAt)))
          .orderBy(agency.name, client.name, client.id),
        deps.service.select().from(spendGuardEvent).orderBy(desc(spendGuardEvent.createdAt), desc(spendGuardEvent.id)).limit(EVENTS_LIMIT),
      ]);
      const spent = await spendByClient(deps.service, paused.map((c) => c.id), monthStart(now));
      return {
        settings,
        state,
        scopes,
        pausedClients: paused.map((c) => ({
          clientId: c.id, clientName: c.name, agencyId: c.agencyId, agencyName: c.agencyName,
          spendPausedAt: c.at!.toISOString(), spendUsd: spent.get(c.id) ?? 0, limitUsd: effectiveLimitUsd(c.limit, settings),
        })),
        events: events.map((e) => ({
          id: e.id, kind: e.kind, createdAt: e.createdAt.toISOString(), agencyId: e.agencyId, clientId: e.clientId, scope: e.scope,
          observedUsd: e.observedUsd, baselineUsd: e.baselineUsd, limitUsd: e.limitUsd, actor: e.actor, note: e.note,
        })),
      };
    });
  },
});

export const getAiGuardState = defineTool({
  name: 'get_ai_guard_state',
  access: 'read',
  description: 'Platform operators: the platform AI guard state (ok, warn or paused).',
  input: z.object({}),
  output: GuardState,
  permission: 'agency',
  audit: 'skip-web',
  supportHidden: true,
  async handler(ctx: AccessContext, input, deps) {
    const role = await requireGuardOperator(deps, ctx, 'viewer');
    return withPlatformAudit(deps, ctx, { tool: 'get_ai_guard_state', input, role }, () => readAiGuardState(deps.service));
  },
});

/** Every field optional with no default (a `.partial()` of a defaulted schema would reset omitted keys to their defaults). */
const SettingsPatch = z.object(
  Object.fromEntries(Object.entries(SpendGuardSettings.shape).map(([k, v]) => [k, (v instanceof z.ZodDefault ? (v.unwrap() as z.ZodNumber) : (v as z.ZodNumber)).optional()])) as {
    [K in keyof SpendGuardSettings]: z.ZodOptional<z.ZodNumber>;
  },
);

export const updateSpendGuardSettings = defineTool({
  name: 'update_spend_guard_settings',
  access: 'write',
  description: 'Platform owners: change the AI spend guard settings (credits per USD, default client limit, pause and spike thresholds, floors, snooze). Omitted keys keep their value; the merged result must stay valid.',
  input: SettingsPatch,
  output: Settings,
  permission: 'agency',
  audit: 'skip-web',
  supportHidden: true,
  async handler(ctx: AccessContext, input, deps) {
    const role = await requireGuardOperator(deps, ctx, 'owner');
    return withPlatformAudit(deps, ctx, { tool: 'update_spend_guard_settings', input, role }, async () => {
      const patch = Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined));
      if (Object.keys(patch).length === 0) throw new ToolError('invalid_input', 'Nothing to change');
      const merged = SpendGuardSettings.safeParse({ ...(await readSpendGuardSettings(deps.service)), ...patch });
      if (!merged.success) throw new ToolError('invalid_input', merged.error.issues[0]?.message || 'Pause threshold must be above the warn threshold');
      const value = merged.data;
      await deps.service
        .insert(platformSetting)
        .values({ key: SPEND_GUARD_SETTINGS_KEY, value, updatedBy: ctx.userId })
        .onConflictDoUpdate({ target: platformSetting.key, set: { value, updatedBy: ctx.userId, updatedAt: new Date() } });
      return value;
    });
  },
});

export const resetAiPause = defineTool({
  name: 'reset_ai_pause',
  access: 'write',
  description: 'Platform staff: clear the platform AI pause (or warning). The guard is snoozed for the configured hours (pause-level readings then only warn); queued work resumes.',
  input: z.object({ note: z.string().trim().min(1).max(200) }),
  output: GuardState,
  permission: 'agency',
  audit: 'skip-web',
  supportHidden: true,
  async handler(ctx: AccessContext, input, deps) {
    const role = await requireGuardOperator(deps, ctx, 'staff');
    return withPlatformAudit(deps, ctx, { tool: 'reset_ai_pause', input, role }, async () => {
      const settings = await readSpendGuardSettings(deps.service);
      return deps.service.transaction(async (tx) => {
        const prev = await lockAiGuardState(tx);
        if (prev.state === 'ok') throw new ToolError('invalid_input', 'Nothing to reset');
        const next: AiGuardState = {
          state: 'ok',
          snoozeUntil: new Date(Date.now() + settings.spikeSnoozeHours * HOUR_MS).toISOString(),
          resetBy: ctx.userId,
        };
        await writeAiGuardState(tx, next, ctx.userId);
        await tx.insert(spendGuardEvent).values({
          kind: 'spike_reset', scope: prev.scope ?? null, observedUsd: prev.observedUsd ?? null, baselineUsd: prev.baselineUsd ?? null, actor: ctx.userId, note: input.note,
        });
        return next;
      });
    });
  },
});

/** Platform-operator tools: exempt from the home agency's billing write guard (billing-guard PLATFORM_TOOLS). */
export const spendGuardPlatformTools = [getSpendGuard, getAiGuardState, updateSpendGuardSettings, resetAiPause];
