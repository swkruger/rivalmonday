import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FILLER_BUSINESSES } from '../rankings';
import { CLIENT_SPECS } from '../tenancy';
import { buildRenamer, DEMO_PLACES, FICTIONAL, guard, type RenameSources, STATE_TERMS } from './rename';
import { finalizeSampleBrief, rankItemCopy, SampleBriefGuardError } from './sample-brief';
import type { SampleBriefData } from './types';

const content = (f: string) => new URL(`../../../../apps/site/content/${f}`, import.meta.url);

const R1 = '11111111-1111-4111-8111-111111111111';
const R2 = '22222222-2222-4222-8222-222222222222';
const I1 = '33333333-3333-4333-8333-333333333333';
const I2 = '44444444-4444-4444-8444-444444444444';
const E1 = '55555555-5555-4555-8555-555555555555';
const E2 = '66666666-6666-4666-8666-666666666666';

const sources: RenameSources = {
  client: 'Lone Star Cooling',
  businesses: ['Hill Country Air & Heat', 'Brazos Valley HVAC', 'Rapid Air Solutions'],
  places: [...DEMO_PLACES],
  domains: ['hill-country-air.example', 'brazos-valley-hvac.example'],
};

/** Raw rows as `collectSampleBrief` builds them, plus keys the site must never see (they are dropped by construction). */
function fixture(): SampleBriefData {
  const extra = { upsell_tag: 'ppc_audit', place_id: 'demo-place-x', reviewer_hash: 'abc123' };
  return {
    version: 1, label: 'Sample data',
    business: { name: 'Lone Star Cooling', vertical: 'Heating & air', area: 'Granbury', ...extra } as SampleBriefData['business'],
    weekOf: '2026-10-19',
    rivals: [
      { id: R1, name: 'Hill Country Air & Heat', tier: 'top', ...extra } as SampleBriefData['rivals'][number],
      { id: R2, name: 'Brazos Valley HVAC', tier: 'watch' },
    ],
    items: [
      {
        id: I1, rivalId: R1, kind: 'website', headline: 'Hill Country Air & Heat cut its AC tune-up to $79 (was $99)', whatChanged: 'Cut in Granbury, TX 76048.',
        whyItMatters: 'Price-sensitive customers compare.', recommendedAction: 'Promote a value bundle.', evidenceIds: [E1], ...extra,
        nested: { deeper: { upsell_tag: 'x' } },
      } as SampleBriefData['items'][number],
      { id: I2, rivalId: R2, kind: 'ads', headline: 'Brazos Valley HVAC started 3 Google ads', whatChanged: 'Ads.', whyItMatters: 'More calls.', recommendedAction: 'Check coverage.', evidenceIds: [E2] },
    ],
    evidence: {
      [E1]: {
        id: E1, kind: 'snapshot', rivalId: R1, url: 'https://hill-country-air.example/pricing', capturedAt: '2026-10-18T06:00:00.000Z', title: 'Hill Country Air & Heat pricing',
        before: ['Hill Country Air & Heat pricing', 'AC tune-up: $99', 'Call (817) 555-0142'], after: ['Hill Country Air & Heat pricing', 'AC tune-up: $79', 'Call (817) 555-0142'], changed: 1,
        ...extra,
      } as SampleBriefData['evidence'][string],
      [E2]: { id: E2, kind: 'ad', rivalId: R2, platform: 'google', firstSeen: '2026-10-16', headline: 'Same-day AC repair in Granbury', body: 'See why Hood County families call us first.' },
      'rank:w1': { id: 'rank:w1', kind: 'rank', keyword: 'ac repair granbury', weekOf: '2026-10-19', summary: 'top 3 in 12 of 49 points' },
    },
    rankGrid: { keyword: 'ac repair granbury', size: 7, weeks: [{ weekOf: '2026-10-19', you: [1, null, 3], leaderRivalId: R1, ...extra } as SampleBriefData['rankGrid']['weeks'][number]] },
    ...extra,
  } as SampleBriefData;
}

/** The schema's key list per level, written out here (not imported) so the test checks the exporter, not itself. */
const KEYS = {
  root: ['version', 'label', 'business', 'weekOf', 'rivals', 'items', 'evidence', 'rankGrid'],
  business: ['name', 'vertical', 'area'],
  rival: ['id', 'name', 'tier'],
  item: ['id', 'rivalId', 'kind', 'headline', 'whatChanged', 'whyItMatters', 'recommendedAction', 'evidenceIds'],
  snapshot: ['id', 'kind', 'rivalId', 'url', 'capturedAt', 'title', 'before', 'after', 'changed'],
  reviews: ['id', 'kind', 'rivalId', 'from', 'to', 'count', 'reviews'],
  review: ['author', 'rating', 'date', 'text'],
  ad: ['id', 'kind', 'rivalId', 'platform', 'firstSeen', 'headline', 'body'],
  rank: ['id', 'kind', 'keyword', 'weekOf', 'summary'],
  rankGrid: ['keyword', 'size', 'weeks'],
  week: ['weekOf', 'you', 'leaderRivalId'],
} as const;
const keysOf = (o: object) => Object.keys(o).sort();
const want = (k: readonly string[]) => [...k].sort();

/** Every object in the output, checked against its schema level. Fails on any object it does not know. */
function assertShape(d: SampleBriefData): void {
  expect(keysOf(d)).toEqual(want(KEYS.root));
  expect(keysOf(d.business)).toEqual(want(KEYS.business));
  for (const r of d.rivals) expect(keysOf(r)).toEqual(want(KEYS.rival));
  for (const i of d.items) expect(keysOf(i)).toEqual(want(KEYS.item));
  for (const e of Object.values(d.evidence)) {
    expect(keysOf(e)).toEqual(want(KEYS[e.kind]));
    if (e.kind === 'reviews') for (const r of e.reviews) expect(keysOf(r)).toEqual(want(KEYS.review));
  }
  expect(keysOf(d.rankGrid)).toEqual(want(KEYS.rankGrid));
  for (const w of d.rankGrid.weeks) expect(keysOf(w)).toEqual(want(KEYS.week));
}

describe('finalizeSampleBrief', () => {
  it('finalize renames every string and re-keys ids consistently', () => {
    const out = finalizeSampleBrief(fixture(), sources);
    const terms = buildRenamer(sources).terms;
    expect(out.business.name).toBe(FICTIONAL.client);
    expect(out.business.area).toBe(terms.get('Granbury'));
    expect(out.rivals.map((r) => r.id)).toEqual(['r1', 'r2']);
    expect(out.rivals.map((r) => r.name)).toEqual([terms.get('Hill Country Air & Heat'), terms.get('Brazos Valley HVAC')]);
    expect(out.items.map((i) => i.id)).toEqual(['i1', 'i2']);
    expect(out.items.map((i) => i.rivalId)).toEqual(['r1', 'r2']);
    expect(out.items.map((i) => i.evidenceIds)).toEqual([['e1'], ['e2']]);
    expect(Object.keys(out.evidence)).toEqual(['e1', 'e2', 'e3']);
    for (const [k, e] of Object.entries(out.evidence)) expect(e.id).toBe(k);
    expect(out.evidence.e1).toMatchObject({ kind: 'snapshot', rivalId: 'r1', changed: 1 });
    expect(out.evidence.e2).toMatchObject({ kind: 'ad', rivalId: 'r2' });
    expect(out.rankGrid.weeks[0]!.leaderRivalId).toBe('r1');
    expect(out.items[0]!.headline).toBe(`${terms.get('Hill Country Air & Heat')} cut its AC tune-up to $79 (was $99)`);
    expect(out.rankGrid.keyword).toBe(`ac repair ${terms.get('Granbury')!.toLowerCase()}`);
    const json = JSON.stringify(out);
    for (const s of [...sources.businesses, sources.client, 'Granbury', 'Hood County', '76048', '817', ', TX', R1, I1, E1]) expect(json).not.toContain(s);
  });

  it('finalize outputs only SampleBriefData keys', () => {
    const out = finalizeSampleBrief(fixture(), sources);
    assertShape(out);
    expect(JSON.stringify(out)).not.toMatch(/upsell_tag|place_id|reviewer_hash|nested|deeper/);
  });

  it('finalize throws with hit paths when a term survives', () => {
    const raw = fixture();
    raw.items[0]!.whyItMatters = 'Brazos Digital noticed this first.';
    let err: unknown;
    try {
      // Without "Brazos" as a place source nothing renames it (with DEMO_PLACES it becomes "<place> Digital").
      finalizeSampleBrief(raw, { ...sources, places: ['Granbury', 'Hood County'] });
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(SampleBriefGuardError);
    expect((err as SampleBriefGuardError).hits).toContainEqual({ path: '$.items[0].whyItMatters', reason: 'term:Brazos Digital' });
  });

  it('finalize refuses a reference to an unknown rival or evidence id', () => {
    const raw = fixture();
    raw.items[1]!.evidenceIds = ['missing'];
    expect(() => finalizeSampleBrief(raw, sources)).toThrow(/unknown evidence/);
  });

  it('finalize refuses an item without evidence and an unknown ad platform', () => {
    const noEvidence = fixture();
    noEvidence.items[1]!.evidenceIds = [];
    expect(() => finalizeSampleBrief(noEvidence, sources)).toThrow(/no evidence/);
    const badPlatform = fixture();
    (badPlatform.evidence[E2] as { platform: string }).platform = 'tiktok';
    expect(() => finalizeSampleBrief(badPlatform, sources)).toThrow(/unknown ad platform/);
  });
});

describe('rankItemCopy', () => {
  it('builds claim and both evidence summaries from the same counts, with no average position', () => {
    const c = rankItemCopy({ rival: 'R', keyword: 'k', before: { n: 8, points: 49 }, after: { n: 31, points: 49 } });
    expect(c.headline).toBe('"k": top-3 share 16% → 63%');
    expect(c.whyItMatters).toBe('R now shows in the map top 3 across 63% of your service area, up from 16%.');
    expect(c.summary).toBe('R: top 3 in 31 of 49 points');
    expect(c.summaryBefore).toBe('R: top 3 in 8 of 49 points');
    expect(JSON.stringify(c)).not.toMatch(/average|position/);
    const evidence = [c.summary, c.summaryBefore].join(' ');
    expect(uncitedNumbers([c.headline, c.whatChanged, c.whyItMatters, c.recommendedAction], evidence)).toEqual([]);
  });
});

/** ISO dates and timestamps are not figures. */
const ISO_DATE = /\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})?)?/g;
/** Evidence values that are references or indexes, not figures. */
const NOT_FIGURES = new Set(['id', 'rivalId', 'changed']);

/**
 * Numbers in item text that its cited evidence does not back: a whole number must appear as a token in the evidence
 * (or equal the number of cited ads: "started 2 ads" citing 2 ads); a percentage must be derivable
 * from a cited "N of P" pair (Math.round(N / P * 100)).
 */
function uncitedNumbers(texts: string[], evidenceText: string, ads = 0): string[] {
  const ev = evidenceText.replace(ISO_DATE, ' ');
  const tokens = new Set(ev.match(/\d+(?:[.,]\d+)*/g) ?? []);
  const shares = new Set([...ev.matchAll(/(\d+) of (\d+)/g)].map((m) => String(Math.round((Number(m[1]) / Number(m[2])) * 100))));
  const problems: string[] = [];
  for (const t of texts) {
    const clean = t.replace(ISO_DATE, ' ');
    for (const m of clean.matchAll(/(\d+(?:[.,]\d+)*)(%?)/g)) {
      const [, n, isPct] = m;
      if (isPct ? !shares.has(n!) : !(tokens.has(n!) || (ads > 0 && Number(n) === ads))) problems.push(`${n}${isPct}`);
    }
  }
  return problems;
}

function evidenceText(d: SampleBriefData, ids: string[]): string {
  const out: string[] = [];
  const walk = (v: unknown): void => {
    if (typeof v === 'string' || typeof v === 'number') out.push(String(v));
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) if (!NOT_FIGURES.has(k)) walk(x);
  };
  for (const id of ids) walk(d.evidence[id]);
  return out.join(' | ');
}

describe('committed site content', () => {
  it('committed json passes the guard', () => {
    const json = JSON.parse(readFileSync(content('sample-brief.json'), 'utf8')) as SampleBriefData;
    assertShape(json);
    const specNames = Object.values(CLIENT_SPECS).flatMap((s) => [s.name, ...s.competitors.map((c) => c.name)]);
    const deny = [...DEMO_PLACES, ...Object.keys(STATE_TERMS), ...FILLER_BUSINESSES, ...specNames];
    const fictionalSlugs = [FICTIONAL.client, ...FICTIONAL.stems].map((s) => s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-'));
    const domains = [...JSON.stringify(json).matchAll(/\b([a-z0-9-]+\.example)\b/g)].map((m) => m[1]!);
    const allow = new Set(domains.filter((d) => /^rival-\d+\.example$/.test(d) || fictionalSlugs.some((s) => d.startsWith(s))));
    expect(guard(json, deny, allow)).toEqual([]);
    expect(json.items.length).toBeGreaterThanOrEqual(4);
    for (const i of json.items) expect(i.evidenceIds.length).toBeGreaterThan(0);
    expect(json.rankGrid.weeks).toHaveLength(12);
  });

  it("rank item evidence counts the item's rival and agrees with its claim", () => {
    const json = JSON.parse(readFileSync(content('sample-brief.json'), 'utf8')) as SampleBriefData;
    const rankItems = json.items.filter((i) => i.kind === 'rank');
    expect(rankItems.length).toBeGreaterThan(0);
    for (const item of rankItems) {
      const rival = json.rivals.find((r) => r.id === item.rivalId)!;
      const ev = item.evidenceIds.map((id) => json.evidence[id]!).find((e) => e.kind === 'rank');
      if (ev?.kind !== 'rank') throw new Error('rank item without rank evidence');
      const m = /^(.+): top 3 in (\d+) of (\d+) points$/.exec(ev.summary);
      expect(m?.[1]).toBe(rival.name);
      const share = Math.round((Number(m![2]) / Number(m![3])) * 100);
      expect(item.whyItMatters).toBe(`${rival.name} now shows in the map top 3 across ${share}% of your service area, up from ${/up from (\d+)%/.exec(item.whyItMatters)![1]}%.`);
      expect(item.headline.endsWith(`→ ${share}%`)).toBe(true);
      expect(item.whatChanged).toContain(`at ${m![2]} of ${m![3]} points`);
    }
  });

  it('every number in committed item text is backed by its cited evidence', () => {
    const json = JSON.parse(readFileSync(content('sample-brief.json'), 'utf8')) as SampleBriefData;
    // Sanity: "8 of 49" backs 8 and 16%, but not 17% or a 5.5 the evidence never states.
    expect(uncitedNumbers(['up from 8 (16%)'], 'R: top 3 in 8 of 49 points')).toEqual([]);
    expect(uncitedNumbers(['5.5 → 3.1, 17%'], 'R: top 3 in 8 of 49 points')).toEqual(['5.5', '3.1', '17%']);
    expect(uncitedNumbers(['on 2026-10-13'], 'x')).toEqual([]);
    const problems = json.items.flatMap((i) =>
      uncitedNumbers([i.headline, i.whatChanged, i.whyItMatters, i.recommendedAction], evidenceText(json, i.evidenceIds), i.evidenceIds.filter((id) => json.evidence[id]?.kind === 'ad').length).map((p) => `${i.id}: ${p}`));
    expect(problems).toEqual([]);
  });

  it('a rank item cites the earlier scan it compares against', () => {
    const json = JSON.parse(readFileSync(content('sample-brief.json'), 'utf8')) as SampleBriefData;
    for (const item of json.items.filter((i) => i.kind === 'rank')) {
      const evs = item.evidenceIds.map((id) => json.evidence[id]!).filter((e) => e.kind === 'rank');
      expect(evs).toHaveLength(2);
      const [after, before] = evs as Extract<SampleBriefData['evidence'][string], { kind: 'rank' }>[];
      expect(before!.weekOf < after!.weekOf).toBe(true);
      expect(item.whatChanged).toContain(`up from ${/top 3 in (\d+ of \d+) points$/.exec(before!.summary)![1]}`);
    }
  });

  it('committed verticals are id/name pairs, sorted, no generic', () => {
    const list = JSON.parse(readFileSync(content('verticals.json'), 'utf8')) as { id: string; name: string }[];
    expect(list.length).toBeGreaterThan(0);
    for (const v of list) {
      expect(keysOf(v)).toEqual(['id', 'name']);
      expect(typeof v.id).toBe('string');
      expect(typeof v.name).toBe('string');
    }
    expect(list.map((v) => v.id)).not.toContain('generic');
    expect(list.map((v) => v.name)).toEqual([...list.map((v) => v.name)].sort((a, b) => a.localeCompare(b)));
  });
});
