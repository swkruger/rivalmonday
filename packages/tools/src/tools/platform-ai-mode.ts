import { DEFAULT_AI_CONFIG_PATH, loadAiConfigFile } from '@cs/ai';
import { type AccessContext, ToolError, toolkit } from '@cs/core';
import { decisionSample, llmCall, readAiDecisionState, updateAiDecisionState } from '@cs/db';
import { and, eq, gte, like, lt, sql } from 'drizzle-orm';
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
  /** Re-evaluation LLM spend ledgered as `<task>:reeval` inside the window. */
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

async function windowResults(deps: ToolDeps, from: Date, to: Date): Promise<z.infer<typeof TaskRow>[]> {
  const end = new Date(to.getTime() + 1);
  const [rows, spend, taus] = await Promise.all([
    deps.service
      .select({ task: decisionSample.task, primary: decisionSample.primary, fallback: decisionSample.fallback })
      .from(decisionSample)
      .where(and(eq(decisionSample.reason, 'reeval'), gte(decisionSample.createdAt, from), lt(decisionSample.createdAt, end))),
    deps.service
      .select({ task: llmCall.task, usd: sql<number>`coalesce(sum(${llmCall.costUsd}), 0)::float8` })
      .from(llmCall)
      .where(and(like(llmCall.task, '%:reeval'), gte(llmCall.createdAt, from), lt(llmCall.createdAt, end)))
      .groupBy(llmCall.task),
    loadTaus(),
  ]);
  const usdBy = new Map(spend.map((r) => [r.task.replace(/:reeval$/, ''), r.usd]));
  const by = new Map<string, { samples: number; both: number; agree: number; keys: number; below: number }>();
  for (const r of rows) {
    const a = by.get(r.task) ?? { samples: 0, both: 0, agree: 0, keys: 0, below: 0 };
    a.samples += 1;
    const pa = (r.primary?.answers ?? {}) as Record<string, Answer>;
    const fa = (r.fallback?.answers ?? {}) as Record<string, Answer>;
    const t = taus?.get(r.task);
    for (const [k, p] of Object.entries(pa)) {
      if (typeof p?.confidence === 'number') {
        a.keys += 1;
        if (t && p.confidence < tauOf(t, p.type)) a.below += 1;
      }
      const f = fa[k];
      if (f !== undefined) {
        a.both += 1;
        if (JSON.stringify(p?.value) === JSON.stringify(f?.value)) a.agree += 1;
      }
    }
    by.set(r.task, a);
  }
  for (const task of usdBy.keys()) if (!by.has(task)) by.set(task, { samples: 0, both: 0, agree: 0, keys: 0, below: 0 });
  return [...by.entries()]
    .sort(([x], [y]) => x.localeCompare(y))
    .map(([task, a]) => ({
      task,
      samples: a.samples,
      agreement: a.both === 0 ? null : a.agree / a.both,
      jevBelowTau: !taus || !taus.has(task) || a.keys === 0 ? null : a.below / a.keys,
      llmUsd: usdBy.get(task) ?? 0,
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
      const st = await readAiDecisionState(deps.service);
      let win: { from: string; to: string } | null = null;
      if (st.reevalUntil) {
        const until = new Date(st.reevalUntil);
        win = { from: st.reevalFrom ?? new Date(until.getTime() - REEVAL_WINDOW_MS).toISOString(), to: (until > now ? now : until).toISOString() };
      } else {
        win = st.lastWindow;
      }
      return {
        mode: st.mode,
        reevalUntil: st.reevalUntil,
        window: win ? { ...win, tasks: await windowResults(deps, new Date(win.from), new Date(win.to)) } : null,
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
      const now = new Date();
      const next = await updateAiDecisionState(
        deps.service,
        (prev) => {
          const active = prev.reevalUntil !== null && new Date(prev.reevalUntil) > now;
          const out = { ...prev, mode: input.mode ?? prev.mode };
          if (input.reeval === 'start') {
            out.reevalUntil = new Date(now.getTime() + REEVAL_WINDOW_MS).toISOString();
            out.reevalFrom = active && prev.reevalFrom ? prev.reevalFrom : now.toISOString();
          } else if (input.reeval === 'stop') {
            if (prev.reevalUntil !== null) {
              const until = new Date(prev.reevalUntil);
              out.lastWindow = { from: prev.reevalFrom ?? new Date(until.getTime() - REEVAL_WINDOW_MS).toISOString(), to: (until > now ? now : until).toISOString() };
            }
            out.reevalFrom = null;
            out.reevalUntil = null;
          }
          return out;
        },
        ctx.userId,
      );
      return { mode: next.mode, reevalUntil: next.reevalUntil };
    });
  },
});

/** Platform-operator tools: exempt from the home agency's billing write guard (billing-guard PLATFORM_TOOLS). */
export const aiDecisionModeTools = [getAiDecisionMode, setAiDecisionMode];
