import { CHANGE_TYPES, MOVE_TYPES } from '@cs/core';
import { z } from 'zod';

const slug = z.string().regex(/^[a-z][a-z0-9_]*$/, 'must be snake_case');
const weight = z.number().min(0).max(1);

const typeWeights = z.strictObject(
  Object.fromEntries(CHANGE_TYPES.map((t) => [t, weight])) as Record<(typeof CHANGE_TYPES)[number], typeof weight>,
);

const uniqueIds = (label: string) => (items: { id: string }[], ctx: z.RefinementCtx) => {
  const seen = new Set<string>();
  items.forEach((item, i) => {
    if (seen.has(item.id)) ctx.addIssue({ code: 'custom', path: [i, 'id'], message: `Duplicate ${label} id "${item.id}"` });
    seen.add(item.id);
  });
};

export const verticalPackSchema = z.object({
  id: slug,
  name: z.string().min(1),
  version: z.number().int().positive(),
  services: z
    .array(z.object({ id: slug, name: z.string().min(1), aliases: z.array(z.string()).default([]) }))
    .min(1)
    .max(255)
    .superRefine(uniqueIds('service')),
  themes: z
    .array(z.object({ id: slug, name: z.string().min(1), description: z.string().min(1) }))
    .min(1)
    .superRefine(uniqueIds('theme')),
  type_weights: typeWeights,
  move_thresholds: z.object({
    hiring_push_postings_30d: z.number().int().positive(),
    rating_drop_90d: z.number().positive(),
    ad_surge_multiplier: z.number().gt(1),
    complaint_spike_multiplier: z.number().gt(1),
  }),
  playbooks: z
    .array(
      z.object({
        id: slug,
        trigger: z.enum([...MOVE_TYPES, ...CHANGE_TYPES]),
        title: z.string().min(1),
        template: z.string().min(1),
      }),
    )
    .superRefine(uniqueIds('playbook')),
});

export type VerticalPack = z.infer<typeof verticalPackSchema>;
