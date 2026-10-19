import { SELF_RULE_IDS } from '@cs/core';
import type { ScoreThresholds } from '@cs/db';
import type { DiscoveryConfig, PackSelfRule, VerticalPack } from '@cs/verticals';
import { isDeepStrictEqual } from 'node:util';
import type { Playbook } from '../briefs/playbooks';
import type { RunbookItem } from './items';

export type UpdateState = 'in_sync' | 'update_available' | 'new_upstream' | 'removed_upstream';

export function compareWithParent(child: RunbookItem[], parent: RunbookItem[]): { key: string; state: UpdateState; parentVersion: number | null }[] {
  const c = new Map(child.map((i) => [i.key, i]));
  const p = new Map(parent.map((i) => [i.key, i]));
  const out: { key: string; state: UpdateState; parentVersion: number | null }[] = [];
  for (const key of new Set([...p.keys(), ...c.keys()])) {
    const ci = c.get(key);
    const pi = p.get(key);
    let state: UpdateState = 'in_sync';
    if (pi && !ci) state = 'new_upstream';
    else if (ci && !pi) state = ci.upstreamVersion !== null ? 'removed_upstream' : 'in_sync';
    else if (ci && pi && pi.version > (ci.upstreamVersion ?? 0) && pi.version !== ci.dismissedUpstreamVersion) state = 'update_available';
    out.push({ key, state, parentVersion: pi?.version ?? null });
  }
  return out;
}

/** (pre-flight ruling) The agency runbook is used only when the pack's plays and self-rules equal the generic pack's. */
export function packUsesGenericPlays(pack: VerticalPack, generic: VerticalPack): boolean {
  return isDeepStrictEqual(pack.playbooks, generic.playbooks) && isDeepStrictEqual(pack.self_rules, generic.self_rules);
}

export function copyItems(parent: RunbookItem[]): RunbookItem[] {
  return parent.map((p) => ({
    key: p.key,
    kind: p.kind,
    content: structuredClone(p.content),
    enabled: p.enabled,
    businessAreaIds: p.businessAreaIds ? [...p.businessAreaIds] : null,
    version: 1,
    upstreamVersion: p.version,
    upstreamSnapshot: structuredClone({ content: p.content, enabled: p.enabled, businessAreaIds: p.businessAreaIds }),
    dismissedUpstreamVersion: null,
    customised: false,
    removedUpstream: false,
  }));
}

export interface EffectiveRunbook {
  source: 'client' | 'agency' | 'legacy';
  plays: (Playbook & { version: number; businessAreaIds: string[] | null; effort?: 'L' | 'M' | 'H'; impact?: 'L' | 'M' | 'H' })[];
  selfRules: PackSelfRule[];
  thresholds: ScoreThresholds | null;
  focusAreaIds: string[];
  tierLimits: DiscoveryConfig['tiers'] | null;
}

type PlayContent = { trigger: string; title: string; template: string; effort?: 'L' | 'M' | 'H'; impact?: 'L' | 'M' | 'H' };

/** An empty `businessAreaIds` array is treated like null (no restriction); `clientServices` null disables area filtering. */
export function effectiveFrom(items: RunbookItem[], source: EffectiveRunbook['source'], clientServices: string[] | null): EffectiveRunbook {
  const live = items.filter((i) => i.enabled);
  const plays: EffectiveRunbook['plays'] = [];
  for (const i of live.filter((x) => x.kind === 'play')) {
    const c = i.content as PlayContent;
    const areas = i.businessAreaIds;
    const selfRule = (SELF_RULE_IDS as readonly string[]).includes(c.trigger);
    if (!selfRule && areas && areas.length > 0 && clientServices && !areas.some((a) => clientServices.includes(a))) continue;
    plays.push({
      id: i.key.replace(/^play:/, ''), trigger: c.trigger, title: c.title, template: c.template, source: 'agency',
      version: i.version, businessAreaIds: areas, ...(c.effort ? { effort: c.effort } : {}), ...(c.impact ? { impact: c.impact } : {}),
    });
  }
  const knob = (name: string) => live.find((i) => i.kind === 'knob' && i.key === `knob:${name}`)?.content;
  return {
    source,
    plays,
    selfRules: live.filter((i) => i.kind === 'self_rule').map((i) => i.content as PackSelfRule),
    thresholds: (knob('thresholds') as ScoreThresholds | undefined) ?? null,
    focusAreaIds: (knob('focus_areas') as { areaIds: string[] } | undefined)?.areaIds ?? [],
    tierLimits: (knob('tier_limits') as DiscoveryConfig['tiers'] | undefined) ?? null,
  };
}
