// @vitest-environment node
import { describe, expect, it } from 'vitest';
import json from '../../content/sample-brief.json';
import { SAMPLE, sampleBriefSchema } from './schema';

/** Second line of defence behind the exporter's guard: real demo places and state words never reach the site. */
const DENY = ['Granbury', 'Texas', 'TX', 'Acton', 'Cleburne', 'Stephenville', 'Weatherford', 'Brazos', 'Lone Star', 'Hood County'];

describe('sample brief schema', () => {
  it('committed sample-brief.json parses', () => {
    expect(sampleBriefSchema.safeParse(json).success).toBe(true);
    expect(SAMPLE.business.name.length).toBeGreaterThan(0);
  });

  it('rejects an unknown evidence kind', () => {
    const bad = structuredClone(json) as unknown as { evidence: Record<string, { kind: string }> };
    Object.values(bad.evidence)[0]!.kind = 'screenshot';
    expect(sampleBriefSchema.safeParse(bad).success).toBe(false);
  });

  it('every evidenceId referenced exists', () => {
    const ids = SAMPLE.items.flatMap((i) => i.evidenceIds);
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) expect(SAMPLE.evidence[id], id).toBeDefined();
    for (const [key, ev] of Object.entries(SAMPLE.evidence)) expect(ev.id).toBe(key);
    const rivalIds = new Set(SAMPLE.rivals.map((r) => r.id));
    for (const i of SAMPLE.items) if (i.rivalId !== null) expect(rivalIds.has(i.rivalId)).toBe(true);
  });

  it('≥ 4 items, 12 weeks, size² cells per week', () => {
    expect(SAMPLE.items.length).toBeGreaterThanOrEqual(4);
    expect(SAMPLE.rankGrid.weeks).toHaveLength(12);
    for (const w of SAMPLE.rankGrid.weeks) expect(w.you).toHaveLength(SAMPLE.rankGrid.size ** 2);
  });

  it('label is Sample data', () => {
    expect(SAMPLE.label).toBe('Sample data');
  });

  it('no deny-listed real place', () => {
    const text = JSON.stringify(json);
    for (const term of DENY) expect(new RegExp(`\\b${term}\\b`, 'i').test(text), term).toBe(false);
  });
});
