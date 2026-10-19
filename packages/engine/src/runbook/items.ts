import { CHANGE_TYPES, MOVE_TYPES, SELF_RULE_IDS } from '@cs/core';
import { discoverySchema, selfRuleSchema, type VerticalPack } from '@cs/verticals';
import { z } from 'zod';
import { PLAYBOOK_TEMPLATE_MAX, PLAYBOOK_TITLE_MAX, unknownPlaybookVars } from '../briefs/playbooks';

export const playContentSchema = z.strictObject({
  trigger: z.enum([...MOVE_TYPES, ...CHANGE_TYPES, ...SELF_RULE_IDS]),
  title: z.string().min(1).max(PLAYBOOK_TITLE_MAX).refine((t) => !t.includes('{{'), 'no placeholders in titles'),
  template: z.string().min(1).max(PLAYBOOK_TEMPLATE_MAX).refine((t) => unknownPlaybookVars(t).length === 0, 'unknown placeholder'),
  effort: z.enum(['L', 'M', 'H']).optional(),
  impact: z.enum(['L', 'M', 'H']).optional(),
});
export const selfRuleContentSchema = selfRuleSchema;
export const knobContentSchemas = {
  thresholds: z.strictObject({ alert: z.number().int().min(1).max(100), brief: z.number().int().min(0).max(99) }).refine((t) => t.brief < t.alert, 'brief must be below alert'),
  focus_areas: z.strictObject({ areaIds: z.array(z.string().max(40)).max(20) }),
  tier_limits: discoverySchema.shape.tiers,
} as const;

export type ItemKind = 'play' | 'self_rule' | 'knob';
export interface RunbookItem {
  key: string;
  kind: ItemKind;
  content: unknown;
  enabled: boolean;
  businessAreaIds: string[] | null;
  version: number;
  upstreamVersion: number | null;
  upstreamSnapshot: unknown | null;
  dismissedUpstreamVersion: number | null;
  customised: boolean;
  removedUpstream: boolean;
}

export function parseItemContent(kind: ItemKind, key: string, content: unknown): { ok: true; value: unknown } | { ok: false; error: string } {
  let schema: z.ZodType;
  if (kind === 'play') schema = playContentSchema;
  else if (kind === 'self_rule') schema = selfRuleContentSchema;
  else {
    const name = key.startsWith('knob:') ? key.slice(5) : key;
    if (!Object.hasOwn(knobContentSchemas, name)) return { ok: false, error: `Unknown knob ${name}` };
    schema = knobContentSchemas[name as keyof typeof knobContentSchemas];
  }
  const r = schema.safeParse(content);
  if (r.success) return { ok: true, value: r.data };
  return { ok: false, error: r.error.issues.map((i) => (i.path.length ? `${i.path.join('.')}: ` : '') + i.message).join('; ') };
}

export function itemsFromPack(pack: VerticalPack): Omit<RunbookItem, 'version' | 'upstreamVersion' | 'upstreamSnapshot' | 'dismissedUpstreamVersion' | 'customised' | 'removedUpstream'>[] {
  const plays = pack.playbooks.map((p) => ({
    key: `play:${p.id}`,
    kind: 'play' as const,
    content: { trigger: p.trigger, title: p.title, template: p.template, ...(p.effort ? { effort: p.effort } : {}), ...(p.impact ? { impact: p.impact } : {}) },
    enabled: true,
    businessAreaIds: null,
  }));
  const rules = pack.self_rules.map((r) => ({ key: `self_rule:${r.id}`, kind: 'self_rule' as const, content: r, enabled: true, businessAreaIds: null }));
  return [...plays, ...rules];
}
