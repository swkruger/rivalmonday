import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { z } from 'zod';

const confidence = z.number().min(0).max(1);

/** Per-call HTTP timing. Every task sets it (defaults mirror the old global 60 s x 3 attempts). */
const timing = {
  timeout_ms: z.number().int().positive().default(60_000),
  max_attempts: z.number().int().min(1).max(3).default(3),
  /** Reachable from a web request: must fit Vercel's budget (see REQUEST_PATH_BUDGET_MS). */
  request_path: z.boolean().default(false),
};

/** Vercel request budget (maxDuration 60 s minus headroom): a request_path task's worst case must stay under it. */
export const REQUEST_PATH_BUDGET_MS = 45_000;

const thresholdsSchema = z.object({
  default: confidence,
  choice: confidence.optional(),
  score: confidence.optional(),
  noul: confidence.optional(),
});
export type ConfidenceThresholds = z.infer<typeof thresholdsSchema>;

const openRouterTask = z.object({
  provider: z.literal('openrouter'),
  model: z.string().min(1),
  fallbacks: z.array(z.string().min(1)).default([]),
  mode: z.enum(['chat', 'decisions', 'embeddings']).default('chat'),
  temperature: z.number().min(0).max(2).optional(),
  max_tokens: z.number().int().positive().optional(),
  /** Embeddings only, and required there: requested vector width (must match the DB column width, 512). */
  dimensions: z.number().int().positive().optional(),
  ...timing,
});

const jevTask = z.object({
  provider: z.literal('jev'),
  model: z.string().min(1).default('jev-latest'),
  escalate_to: z.string().min(1).optional(),
  min_confidence: thresholdsSchema.prefault({ default: 0.85 }),
  shadow_rate: z.number().min(0).max(1).default(0),
  ...timing,
});

/** Anthropic Message Batches (Phase 3d decision 9). Prices are batch prices (already 50% of list), for the ledger. */
const anthropicTask = z.object({
  provider: z.literal('anthropic'),
  model: z.string().min(1),
  mode: z.literal('batch'),
  max_tokens: z.number().int().positive().default(8000),
  input_usd_per_mtok: z.number().nonnegative(),
  output_usd_per_mtok: z.number().nonnegative(),
  ...timing,
});

const taskSchema = z.discriminatedUnion('provider', [openRouterTask, jevTask, anthropicTask]);

export const aiConfigSchema = z
  .object({
    openrouter: z
      .object({
        data_collection: z.enum(['allow', 'deny']).default('deny'),
        zdr: z.boolean().default(true),
        app_name: z.string().min(1).default('CompetitorSpy'),
      })
      .prefault({}),
    jev: z.object({ input_usd_per_mtok: z.number().nonnegative().default(0.042) }).prefault({}),
    tasks: z.record(z.string().regex(/^[a-z][a-z0-9_]*$/), taskSchema),
  })
  .superRefine((cfg, ctx) => {
    for (const [name, task] of Object.entries(cfg.tasks)) {
      if (task.provider === 'openrouter' && task.mode === 'embeddings' && task.dimensions === undefined) {
        ctx.addIssue({
          code: 'custom',
          path: ['tasks', name, 'dimensions'],
          message: 'an embeddings task must set dimensions (the DB vector width)',
        });
      }
      // A Jev task's escalation call uses the Jev task's timing, so both stages count toward the budget.
      const stages = task.provider === 'jev' && task.escalate_to ? 2 : 1;
      if (task.request_path && stages * task.timeout_ms * task.max_attempts > REQUEST_PATH_BUDGET_MS) {
        ctx.addIssue({
          code: 'custom',
          path: ['tasks', name, 'timeout_ms'],
          message: `a request_path task must satisfy ${stages > 1 ? '2 x ' : ''}timeout_ms x max_attempts <= ${REQUEST_PATH_BUDGET_MS} (got ${stages * task.timeout_ms * task.max_attempts})`,
        });
      }
      if (task.provider !== 'jev' || !task.escalate_to) continue;
      const target = cfg.tasks[task.escalate_to];
      if (!target || target.provider !== 'openrouter' || target.mode !== 'decisions') {
        ctx.addIssue({
          code: 'custom',
          path: ['tasks', name, 'escalate_to'],
          message: `escalate_to must name an openrouter task with mode "decisions" (got "${task.escalate_to}")`,
        });
      }
    }
  });

export type AiConfig = z.infer<typeof aiConfigSchema>;
export type TaskConfig = AiConfig['tasks'][string];
export type OpenRouterTask = z.infer<typeof openRouterTask>;
export type JevTask = z.infer<typeof jevTask>;
export type AnthropicTask = z.infer<typeof anthropicTask>;

export interface CallTiming {
  timeoutMs: number;
  maxAttempts: number;
}

export function timingOf(task: TaskConfig): CallTiming {
  return { timeoutMs: task.timeout_ms, maxAttempts: task.max_attempts };
}

// Not `new URL('../config/ai.yaml', import.meta.url)`: bundlers (Turbopack/webpack) pattern-match that literal
// form and try to resolve/copy the target as a module/asset (see packages/db/src/migrate.ts for the same fix).
export const DEFAULT_AI_CONFIG_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', 'config', 'ai.yaml');

export function parseAiConfig(yamlText: string): AiConfig {
  const result = aiConfigSchema.safeParse(parse(yamlText));
  if (!result.success) throw new Error(`Invalid AI config:\n${z.prettifyError(result.error)}`);
  return result.data;
}

export async function loadAiConfigFile(path: string): Promise<AiConfig> {
  return parseAiConfig(await readFile(path, 'utf8'));
}
