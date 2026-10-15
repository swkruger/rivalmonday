import { CHANGE_TYPES, MOVE_TYPES, SELF_RULE_IDS } from '@cs/core';
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

const tierThresholds = z.strictObject({ overlap: z.number(), activity: z.number() });

export const discoverySchema = z.strictObject({
  seed_keywords: z.array(z.string().min(2)).max(5),
  categories: z.array(z.string()).min(1),
  related_categories: z.array(z.string()).default([]),
  grid: z.strictObject({ size: z.number().int().min(3).max(7), fallback_size: z.number().int().min(3).max(7) }),
  shortlist: z.number().int().min(5).max(30),
  cost_cap_usd: z.number().positive().max(10),
  tiers: z.strictObject({ top: tierThresholds, watch: tierThresholds }),
});

export type DiscoveryConfig = z.infer<typeof discoverySchema>;

export const selfRuleSchema = z.strictObject({
  id: z.enum(SELF_RULE_IDS),
  weight,
  playbook: z.string(),
  strength: z.boolean().default(false),
  params: z.record(z.string(), z.number()).default({}),
});
export type PackSelfRule = z.infer<typeof selfRuleSchema>;

export const verticalPackSchema = z.object({
  id: slug,
  name: z.string().min(1),
  version: z.number().int().positive(),
  /** How the pack's vertical calls the client's customers in client-facing copy ("patients", "customers"). */
  audience_noun: z.string().min(1).default('customers'),
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
    /** Price war: this many price cuts on overlapping services inside the 90-day window. */
    price_war_cuts_90d: z.number().int().positive().default(2),
    /** Price war (promo + ad burst): this many ads started in the last 30 days alongside a promo. */
    ad_burst_starts_30d: z.number().int().positive().default(3),
    /** Promo blitz: promos in two or more channels within this many days. */
    promo_blitz_window_days: z.number().int().positive().default(14),
  }),
  playbooks: z
    .array(
      z.object({
        id: slug,
        trigger: z.enum([...MOVE_TYPES, ...CHANGE_TYPES, ...SELF_RULE_IDS]),
        title: z.string().min(1),
        template: z.string().min(1),
        /** Level of effort / impact (L, M, H); required for self-rule playbooks, whose brief items have no model-written estimate. */
        effort: z.enum(['L', 'M', 'H']).optional(),
        impact: z.enum(['L', 'M', 'H']).optional(),
      }),
    )
    .superRefine(uniqueIds('playbook'))
    .superRefine((items, ctx) => {
      items.forEach((p, i) => {
        if ((SELF_RULE_IDS as readonly string[]).includes(p.trigger) && (!p.effort || !p.impact)) {
          ctx.addIssue({ code: 'custom', path: [i], message: `Self-rule playbook "${p.id}" needs effort and impact` });
        }
      });
    }),
  /** Spec §6.3 scoring knobs; versioned with the pack so every score records what produced it. */
  scoring: z
    .object({
      version: z.number().int().positive().default(1),
      routing: z
        .object({ alert: z.number().min(0).max(100).default(70), brief: z.number().min(0).max(100).default(40) })
        .prefault({})
        .refine((r) => r.brief < r.alert, 'routing.brief must be below routing.alert'),
      size: z
        .object({
          default: weight.default(0.6),
          price_pct_for_full: z.number().positive().default(20),
          price_min: weight.default(0.3),
          /** Spec §6.3 size curves for structured types: value / *_for_full, floored at structured_min, capped at 1. */
          ads_for_full: z.number().positive().default(5),
          jobs_for_full: z.number().positive().default(5),
          review_z_for_full: z.number().positive().default(4),
          rating_delta_for_full: z.number().positive().default(0.3),
          rank_delta_for_full: z.number().positive().default(5),
          structured_min: weight.default(0.3),
        })
        .prefault({}),
      relevance: z
        .object({ matched: weight.default(1), unmapped: weight.default(0.6), unmatched: weight.default(0.2), outside_territory: weight.default(0.3) })
        .prefault({}),
      novelty_similarity_floor: z.number().min(0).max(0.99).default(0.5),
      novelty_window_days: z.number().int().positive().default(365),
      /** An event older than this when scored is never an alert (capped to brief): backlogs must not page anyone. */
      alert_max_age_days: z.number().int().positive().default(7),
    })
    .prefault({}),
  /** Phase 12b starting point: deterministic findings about the client's own business (closed predicate set in the engine; thresholds in `params`). */
  self_rules: z.array(selfRuleSchema).superRefine(uniqueIds('self rule')).default([]),
  /** Competitor discovery (Phase 12a): Maps search keywords, category filter, grid, shortlist and tier thresholds. */
  discovery: discoverySchema,
});

export type VerticalPack = z.infer<typeof verticalPackSchema>;
