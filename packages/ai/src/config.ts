import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { z } from 'zod';

const confidence = z.number().min(0).max(1);

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
  mode: z.enum(['chat', 'decisions']).default('chat'),
  temperature: z.number().min(0).max(2).optional(),
  max_tokens: z.number().int().positive().optional(),
});

const jevTask = z.object({
  provider: z.literal('jev'),
  model: z.string().min(1).default('jev-latest'),
  escalate_to: z.string().min(1).optional(),
  min_confidence: thresholdsSchema.prefault({ default: 0.85 }),
});

const taskSchema = z.discriminatedUnion('provider', [openRouterTask, jevTask]);

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

export const DEFAULT_AI_CONFIG_PATH = fileURLToPath(new URL('../config/ai.yaml', import.meta.url));

export function parseAiConfig(yamlText: string): AiConfig {
  const result = aiConfigSchema.safeParse(parse(yamlText));
  if (!result.success) throw new Error(`Invalid AI config:\n${z.prettifyError(result.error)}`);
  return result.data;
}

export async function loadAiConfigFile(path: string): Promise<AiConfig> {
  return parseAiConfig(await readFile(path, 'utf8'));
}
