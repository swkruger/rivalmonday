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

/**
 * R3 "one setting": a set `client.score_thresholds` column always lives in the client's `knob:thresholds` item, customised against the
 * parent (agency) knob. Replaces/adds that item in a to-be-created client runbook; no column leaves the items alone.
 */
export function withColumnThresholds(items: RunbookItem[], column: { alert: number; brief: number } | null | undefined, parents: RunbookItem[] | null): RunbookItem[] {
  if (!column) return items;
  const content = { alert: column.alert, brief: column.brief };
  const up = parents?.find((i) => i.key === 'knob:thresholds' && i.kind === 'knob');
  const own = items.find((i) => i.key === 'knob:thresholds');
  const snapshot = up ? structuredClone({ content: up.content, enabled: up.enabled, businessAreaIds: up.businessAreaIds }) : null;
  const next: RunbookItem = {
    key: 'knob:thresholds', kind: 'knob', content, enabled: true, businessAreaIds: null, version: own?.version ?? 1,
    upstreamVersion: up?.version ?? null, upstreamSnapshot: snapshot, dismissedUpstreamVersion: null,
    customised: snapshot ? !(isDeepStrictEqual(snapshot.content, content) && snapshot.enabled === true && snapshot.businessAreaIds === null) : true,
    removedUpstream: false,
  };
  return own ? items.map((i) => (i === own ? next : i)) : [...items, next];
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
