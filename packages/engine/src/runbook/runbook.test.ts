import { loadVerticalPack } from '@cs/verticals';
import { describe, expect, it } from 'vitest';
import { copyItems, compareWithParent, effectiveFrom, itemsFromPack, packUsesGenericPlays, parseItemContent, playContentSchema, type RunbookItem } from './index';

const item = (key: string, o: Partial<RunbookItem> = {}): RunbookItem => ({
  key, kind: 'play', content: { trigger: 'price_change', title: 'T', template: 'x {{competitor}}' }, enabled: true, businessAreaIds: null,
  version: 1, upstreamVersion: null, upstreamSnapshot: null, dismissedUpstreamVersion: null, customised: false, removedUpstream: false, ...o,
});
const states = (c: RunbookItem[], p: RunbookItem[]) => Object.fromEntries(compareWithParent(c, p).map((r) => [r.key, r.state]));

describe('packUsesGenericPlays', () => {
  it('true for generic-config pack, false for hvac and dental', async () => {
    const generic = await loadVerticalPack('generic');
    expect(packUsesGenericPlays({ ...generic, id: 'catalogue_x' }, generic)).toBe(true);
    expect(packUsesGenericPlays(await loadVerticalPack('hvac_plumbing'), generic)).toBe(false);
    expect(packUsesGenericPlays(await loadVerticalPack('dental'), generic)).toBe(false);
  });
});

describe('compareWithParent', () => {
  it('derives each state', () => {
    const parent = [item('a', { version: 2 }), item('b', { version: 1 }), item('c', { version: 1 })];
    const child = [item('a', { upstreamVersion: 1 }), item('b', { upstreamVersion: 1 }), item('d', { upstreamVersion: 1 }), item('own')];
    expect(states(child, parent)).toEqual({ a: 'update_available', b: 'in_sync', c: 'new_upstream', d: 'removed_upstream', own: 'in_sync' });
  });
  it('hides a dismissed version but shows a newer one', () => {
    const c = [item('a', { upstreamVersion: 1, dismissedUpstreamVersion: 2 })];
    expect(states(c, [item('a', { version: 2 })]).a).toBe('in_sync');
    expect(states(c, [item('a', { version: 3 })]).a).toBe('update_available');
  });
  it('a tombstone blocks new_upstream', () => {
    const tomb = item('c', { enabled: false, dismissedUpstreamVersion: 1 });
    expect(states([tomb], [item('c', { version: 1 })]).c).toBe('in_sync');
  });
});

describe('compareWithParent after the topic rename backfill', () => {
  it('reports no upstream change when platform item and agency copy both use the new ids', () => {
    const content = { trigger: 'self_rule:topic_weakness', title: 'Fix {{topic}}', template: 'Look at {{topic}}.' };
    const parent = [item('play:fix_topic', { version: 3, content })];
    const child = [item('play:fix_topic', { upstreamVersion: 3, content, upstreamSnapshot: { content, enabled: true, businessAreaIds: null } })];
    expect(states(child, parent)).toEqual({ 'play:fix_topic': 'in_sync' });
  });
});

describe('copyItems', () => {
  it('snapshots the parent', () => {
    const [c] = copyItems([item('a', { version: 4, businessAreaIds: ['x'] })]);
    expect(c).toMatchObject({ upstreamVersion: 4, customised: false, version: 1, upstreamSnapshot: { enabled: true, businessAreaIds: ['x'], content: { title: 'T' } } });
  });
});

describe('effectiveFrom', () => {
  it('drops disabled and area-limited plays, keeps self-rule plays and null areas', () => {
    const items = [
      item('play:on'), item('play:off', { enabled: false }),
      item('play:hit', { businessAreaIds: ['hvac'] }), item('play:miss', { businessAreaIds: ['roof'] }),
      item('play:sr', { businessAreaIds: ['roof'], content: { trigger: 'profile_gap', title: 'T', template: 'x' } }),
    ];
    const e = effectiveFrom(items, 'client', ['hvac']);
    expect(e.plays.map((p) => p.id).sort()).toEqual(['hit', 'on', 'sr']);
    expect(e.thresholds).toBeNull();
    expect(e.focusAreaIds).toEqual([]);
    expect(e.tierLimits).toBeNull();
  });
  it('reads knobs and drops disabled self rules', () => {
    const e = effectiveFrom([
      item('knob:thresholds', { kind: 'knob', content: { alert: 70, brief: 40 } }),
      item('knob:focus_areas', { kind: 'knob', content: { areaIds: ['a'] } }),
      item('self_rule:x', { kind: 'self_rule', content: { id: 'x' }, enabled: false }),
    ], 'agency', null);
    expect(e.thresholds).toEqual({ alert: 70, brief: 40 });
    expect(e.focusAreaIds).toEqual(['a']);
    expect(e.selfRules).toEqual([]);
  });
});

describe('play schema', () => {
  const ok = { trigger: 'price_change', title: 'T', template: 'x' };
  it('refuses {{ in title, unknown var, over-length template', () => {
    expect(playContentSchema.safeParse(ok).success).toBe(true);
    expect(playContentSchema.safeParse({ ...ok, title: 'a {{competitor}}' }).success).toBe(false);
    expect(playContentSchema.safeParse({ ...ok, template: '{{bogus}}' }).success).toBe(false);
    expect(playContentSchema.safeParse({ ...ok, template: 'x'.repeat(2001) }).success).toBe(false);
    expect(parseItemContent('knob', 'knob:thresholds', { alert: 40, brief: 50 }).ok).toBe(false);
    expect(parseItemContent('knob', 'knob:nope', {}).ok).toBe(false);
  });
});

describe('itemsFromPack', () => {
  it('round-trips hvac playbooks and self rules', async () => {
    const hvac = await loadVerticalPack('hvac_plumbing');
    const items = itemsFromPack(hvac).map((i) => item(i.key, { ...i }));
    for (const i of items.filter((x) => x.kind === 'play')) expect(parseItemContent('play', i.key, i.content).ok).toBe(true);
    const e = effectiveFrom(items, 'agency', null);
    const pick = ({ id, trigger, title, template }: { id: string; trigger: string; title: string; template: string }) => ({ id, trigger, title, template });
    expect(e.plays.map(pick)).toEqual(hvac.playbooks.map(pick));
    expect(e.selfRules).toEqual(hvac.self_rules);
  });
});
