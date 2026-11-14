import { DEFAULT_AI_CONFIG_PATH, loadAiConfigFile } from '@cs/ai';
import { type AccessContext, type AiDecisionMode, ToolError, toolkit } from '@cs/core';
import { hashInput } from '@cs/core/server';
import { decisionSample, llmCall, platformAuditLog, readAiDecisionMode, writeAiDecisionMode } from '@cs/db';
import { and, asc, desc, eq, gte, inArray, like, lt, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { ToolDeps } from '../deps';
import { requirePlatformOperator } from '../platform';
import { withPlatformAudit } from '../platform/audit';

/**
 * 18e Track B (spec B4, plan P8): the staff control for how Jev-primary decision tasks escalate (Jev only vs Jev with LLM backup)
 * and the 7-day re-evaluation window, plus its results. Platform staff only (anything else is a 404), web only, audited by
 * `withPlatformAudit`. Dollars are allowed here (staff channel).
 */
const { defineTool } = toolkit<ToolDeps>();
const DAY_MS = 86_400_000;
export const REEVAL_WINDOW_MS = 7 * DAY_MS;
/** The audit row of a `set_ai_decision_mode` call carries only the input hash; the window start/stop are read back by hash. */
const TOOL = 'set_ai_decision_mode';

async function requireModeOperator(deps: ToolDeps, ctx: AccessContext, min: 'viewer' | 'staff') {
  try {
    return await requirePlatformOperator(deps, ctx, min);
  } catch (err) {
    if (err instanceof ToolError && err.code === 'permission_denied') throw new ToolError('not_found', 'Not found');
    throw err;
  }
}

const Mode = z.enum(['jev_only', 'cascade']);
const TaskRow = z.object({
  task: z.string(),
  samples: z.number(),
  /** Share of question keys (answered by both) where Jev's and the LLM's answers match; null when no key was answered by both. */
  agreement: z.number().nullable(),
  /** Share of Jev's answers whose confidence was under the task's threshold (the live ai.yaml `min_confidence`); null without keys or config. */
  jevBelowTau: z.number().nullable(),
  /** Re-evaluation LLM spend, allocated across tasks by sample share (the ledger row names the shared LLM task, not the Jev task). */
  llmUsd: z.number(),
});
const Window = z.object({ from: z.string(), to: z.string(), tasks: z.array(TaskRow) });
const View = z.object({ mode: Mode, reevalUntil: z.string().nullable(), window: Window.nullable() });
export type AiDecisionModeView = z.infer<typeof View>;

const SetInput = z
  .object({ mode: Mode.optional(), reeval: z.enum(['start', 'stop']).optional() })
  .refine((v) => v.mode !== undefined || v.reeval !== undefined, { message: 'Nothing to change' });

type Answer = { type?: string; value?: unknown; confidence?: number } | undefined;
type Thresholds = { default: number; choice?: number; score?: number; noul?: number };

function tauOf(t: Thresholds, type: string | undefined): number {
  const k = type === 'choice' || type === 'score' || type === 'noul' ? type : undefined;
  return (k ? t[k] : undefined) ?? t.default;
}

/** Jev-primary task thresholds from the live config; `null` when the config cannot be loaded (then `jevBelowTau` is null). */
async function loadTaus(): Promise<Map<string, Thresholds> | null> {
  try {
    const cfg = await loadAiConfigFile(DEFAULT_AI_CONFIG_PATH);
    const m = new Map<string, Thresholds>();
    for (const [name, t] of Object.entries(cfg.tasks)) if (t.provider === 'jev') m.set(name, t.min_confidence);
    return m;
  } catch {
    return null;
  }
}

/** Input hashes the audit row of a start/stop call can carry (with or without a mode change alongside). */
function auditHashes(reeval: 'start' | 'stop'): string[] {
  return [undefined, 'jev_only', 'cascade'].map((mode) => hashInput(SetInput.parse({ ...(mode ? { mode } : {}), reeval })));
}

/** The most recent finished window when `reevalUntil` is null (stopped): from the last `start` audit row to its stop or +7 d. */
async function lastStoppedWindow(deps: ToolDeps): Promise<{ from: Date; to: Date } | null> {
  const [start] = await deps.service
    .select({ at: platformAuditLog.createdAt })
    .from(platformAuditLog)
    .where(and(eq(platformAuditLog.tool, TOOL), eq(platformAuditLog.outcome, 'ok'), inArray(platformAuditLog.inputHash, auditHashes('start'))))
    .orderBy(desc(platformAuditLog.createdAt))
    .limit(1);
  if (!start) return null;
  const [stop] = await deps.service
    .select({ at: platformAuditLog.createdAt })
    .from(platformAuditLog)
    .where(and(eq(platformAuditLog.tool, TOOL), eq(platformAuditLog.outcome, 'ok'), inArray(platformAuditLog.inputHash, auditHashes('stop')), gte(platformAuditLog.createdAt, start.at)))
    .orderBy(asc(platformAuditLog.createdAt))
    .limit(1);
  const natural = new Date(start.at.getTime() + REEVAL_WINDOW_MS);
  return { from: start.at, to: stop && stop.at < natural ? stop.at : natural };
}

async function windowResults(deps: ToolDeps, from: Date, to: Date): Promise<z.infer<typeof TaskRow>[]> {
  const end = new Date(to.getTime() + 1);
  const [rows, spend, taus] = await Promise.all([
    deps.service
      .select({ task: decisionSample.task, primary: decisionSample.primary, fallback: decisionSample.fallback })
      .from(decisionSample)
      .where(and(eq(decisionSample.reason, 'reeval'), gte(decisionSample.createdAt, from), lt(decisionSample.createdAt, end))),
    deps.service
      .select({ usd: sql<number>`coalesce(sum(${llmCall.costUsd}), 0)::float8` })
      .from(llmCall)
      .where(and(like(llmCall.task, '%:reeval'), gte(llmCall.createdAt, from), lt(llmCall.createdAt, end))),
    loadTaus(),
  ]);
  const totalUsd = spend[0]?.usd ?? 0;
  const by = new Map<string, { samples: number; both: number; agree: number; keys: number; below: number }>();
  for (const r of rows) {
    const a = by.get(r.task) ?? { samples: 0, both: 0, agree: 0, keys: 0, below: 0 };
    a.samples += 1;
    const pa = (r.primary?.answers ?? {}) as Record<string, Answer>;
    const fa = (r.fallback?.answers ?? {}) as Record<string, Answer>;
    const t = taus?.get(r.task);
    for (const [k, p] of Object.entries(pa)) {
      a.keys += 1;
      if (t && typeof p?.confidence === 'number' && p.confidence < tauOf(t, p.type)) a.below += 1;
      const f = fa[k];
      if (f !== undefined) {
        a.both += 1;
        if (JSON.stringify(p?.value) === JSON.stringify(f?.value)) a.agree += 1;
      }
    }
    by.set(r.task, a);
  }
  const all = [...by.values()].reduce((n, a) => n + a.samples, 0);
  return [...by.entries()]
    .sort(([x], [y]) => x.localeCompare(y))
    .map(([task, a]) => ({
      task,
      samples: a.samples,
      agreement: a.both === 0 ? null : a.agree / a.both,
      jevBelowTau: !taus || !taus.has(task) || a.keys === 0 ? null : a.below / a.keys,
      llmUsd: all === 0 ? 0 : (totalUsd * a.samples) / all,
    }));
}

export const getAiDecisionMode = defineTool({
  name: 'get_ai_decision_mode',
  access: 'read',
  description: 'Platform operators: whether Jev-primary decisions run Jev only or with the LLM as backup, the re-evaluation window, and per-task results (samples, agreement, Jev unsure share, LLM cost) for the current or last window.',
  input: z.object({}),
  output: View,
  permission: 'agency',
  audit: 'skip-web',
  supportHidden: true,
  async handler(ctx: AccessContext, input, deps) {
    const role = await requireModeOperator(deps, ctx, 'viewer');
    return withPlatformAudit(deps, ctx, { tool: 'get_ai_decision_mode', input, role }, async () => {
      const now = new Date();
      const { mode, reevalUntil } = await readAiDecisionMode(deps.service);
      let win: { from: Date; to: Date } | null;
      if (reevalUntil) {
        const until = new Date(reevalUntil);
        win = { from: new Date(until.getTime() - REEVAL_WINDOW_MS), to: until > now ? now : until };
      } else {
        win = await lastStoppedWindow(deps);
      }
      return {
        mode,
        reevalUntil,
        window: win ? { from: win.from.toISOString(), to: win.to.toISOString(), tasks: await windowResults(deps, win.from, win.to) } : null,
      };
    });
  },
});

export const setAiDecisionMode = defineTool({
  name: 'set_ai_decision_mode',
  access: 'write',
  description: 'Platform staff: switch Jev-primary decisions between Jev only and Jev with LLM backup, and/or start (7 days) or stop the re-evaluation window where every model answers.',
  input: SetInput,
  output: z.object({ mode: Mode, reevalUntil: z.string().nullable() }),
  permission: 'agency',
  audit: 'skip-web',
  supportHidden: true,
  async handler(ctx: AccessContext, input, deps) {
    const role = await requireModeOperator(deps, ctx, 'staff');
    return withPlatformAudit(deps, ctx, { tool: TOOL, input, role }, async () => {
      const prev = await readAiDecisionMode(deps.service);
      const next: AiDecisionMode = {
        mode: input.mode ?? prev.mode,
        reevalUntil: input.reeval === 'start' ? new Date(Date.now() + REEVAL_WINDOW_MS).toISOString() : input.reeval === 'stop' ? null : prev.reevalUntil,
      };
      await writeAiDecisionMode(deps.service, next, ctx.userId);
      return next;
    });
  },
});

/** Platform-operator tools: exempt from the home agency's billing write guard (billing-guard PLATFORM_TOOLS). */
export const aiDecisionModeTools = [getAiDecisionMode, setAiDecisionMode];
