import { normalizeLabel } from '@cs/engine';
import { describe, expect, it } from 'vitest';
import { evalCaseSchema } from '../case';
import { type ChangeInput, carryLabels, questionsFor, type ReviewInput } from './common';
import { changeRowsToCases, reviewRowsToCases } from './cs-dev';
import { buildGolden, GOLDEN_MUTATIONS, goldenChanges, GOLDEN_PAGES } from './golden';
import { buildSynthetic, CHANGE_TEMPLATES, REVIEW_TEMPLATES, reviewTemplateLabel } from './synthetic';

const validLabel = (suite: 'changes' | 'reviews', input: ChangeInput | ReviewInput, label: unknown) => {
  const qs = questionsFor(suite, input.verticalIds);
  expect(Object.keys(qs).sort()).toEqual([...input.questionKeys].sort());
  const l = label as Record<string, string>;
  expect(Object.keys(l).sort()).toEqual([...input.questionKeys].sort());
  for (const [k, v] of Object.entries(l)) expect(normalizeLabel(qs[k], v), `${k}=${v}`).toBe(v);
};

describe('golden', () => {
  it('golden builds the same cases twice', () => {
    const a = buildGolden();
    expect(buildGolden()).toEqual(a);
    expect(new Set(a.map((c) => c.id)).size).toBe(a.length);
    for (const c of a) evalCaseSchema.parse(c);
    expect(a.length).toBeGreaterThanOrEqual(40);
    expect(a.length).toBeLessThanOrEqual(60);
  });

  it('every scripted mutation changes exactly one block and carries a valid label', () => {
    for (const m of GOLDEN_MUTATIONS) {
      const page = GOLDEN_PAGES.find((p) => p.file === m.page)!;
      expect(page.html.includes(m.find), `${m.id}: "${m.find}" not in ${m.page}`).toBe(true);
      const changes = goldenChanges(page.html, page.html.replace(m.find, m.replace));
      expect(changes, m.id).toHaveLength(1);
    }
    for (const c of buildGolden().filter((x) => x.source === 'golden' && x.label !== null)) validLabel('changes', c.input as ChangeInput, c.label);
  });

  it('a price mutation reaches the state as a numeric change (engine facts)', () => {
    const c = buildGolden().find((x) => x.id === 'changes-golden-hvac-home-v1-price-cut')!;
    expect((c.input as ChangeInput).state.numeric_changes).toEqual(['price: $89 per system → $59 per system (-33.7%)']);
    expect(c.label).toMatchObject({ meaningful: 'true', change_type: 'price_change', service_hvac_plumbing: 'ac_tune_up' });
  });
});

describe('synthetic', () => {
  it('synthetic labels match their template', () => {
    const changes = buildSynthetic('changes', 120, 71);
    expect(changes).toHaveLength(120);
    for (const c of changes) {
      const t = CHANGE_TEMPLATES.find((x) => c.id.startsWith(`changes-syn-${x.id.replace(/_/g, '-')}-`))!;
      expect(t, c.id).toBeDefined();
      expect(c.label).toEqual(t.label);
      expect(c.labelBy).toBe('template');
      validLabel('changes', c.input as ChangeInput, c.label);
    }
    expect(new Set(changes.map((c) => c.id.split('-')[2])).size).toBeGreaterThan(5);

    const reviews = buildSynthetic('reviews', 80, 71);
    expect(reviews).toHaveLength(80);
    for (const c of reviews) {
      const t = REVIEW_TEMPLATES.find((x) => c.id.startsWith(`reviews-syn-${x.id.replace(/_/g, '-')}-`))!;
      expect(t, c.id).toBeDefined();
      expect(c.label).toEqual(reviewTemplateLabel(t));
      validLabel('reviews', c.input as ReviewInput, c.label);
    }
  });

  it('is deterministic per seed and varies across seeds', () => {
    expect(buildSynthetic('changes', 30, 5)).toEqual(buildSynthetic('changes', 30, 5));
    expect(JSON.stringify(buildSynthetic('reviews', 30, 5))).not.toBe(JSON.stringify(buildSynthetic('reviews', 30, 6)));
    const ids = buildSynthetic('changes', 120, 71).map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('cs_dev mapping', () => {
  const change = (over: Partial<Parameters<typeof changeRowsToCases>[0][number]>) => ({
    competitorName: 'Acme Dental', pageUrl: 'https://acme.example/', pageType: 'home', kind: 'modified', beforeText: 'Cleanings $99', afterText: 'Cleanings $79',
    numericChanges: [], verticalIds: ['dental'], ...over,
  });

  it('dedupes by text, keeps newest first, redacts and skips verticals without an eval pack', () => {
    const cases = changeRowsToCases([
      change({ afterText: 'Call 214-555-0199 for cleanings $79' }),
      change({ afterText: 'Call 214-555-0199 for cleanings $79', pageUrl: 'https://acme.example/b' }),
      change({ afterText: 'New: veneers', verticalIds: ['roofing'] }),
      change({ afterText: 'Invisalign now offered' }),
    ]);
    expect(cases).toHaveLength(2);
    expect(JSON.stringify(cases)).not.toContain('555-0199');
    expect(cases.every((c) => c.source === 'cs_dev' && c.label === null)).toBe(true);
    for (const c of cases) expect((c.input as ChangeInput).questionKeys).toEqual(Object.keys(questionsFor('changes', ['dental'])));
  });

  it('builds review states with the engine builder and never sees reviewer names', () => {
    const cases = reviewRowsToCases([
      { competitorName: 'Acme Dental', rating: 2, text: 'Waited an hour past my appointment, email me at a@b.co', verticalIds: ['dental'] },
      { competitorName: 'Acme Dental', rating: 2, text: 'Waited an hour past my appointment, email me at a@b.co', verticalIds: ['dental'] },
      { competitorName: 'Acme Dental', rating: 5, text: 'ok', verticalIds: ['dental'] },
    ]);
    expect(cases).toHaveLength(1);
    expect((cases[0]!.input as ReviewInput).state).toMatchObject({ business_type: 'Dental practices', rating: 2 });
    expect(JSON.stringify(cases)).not.toContain('a@b.co');
  });

  it('carryLabels keeps a confirmed label only while the input is unchanged', () => {
    const [c] = changeRowsToCases([change({})]);
    const confirmed = { ...c!, label: { x: 'y' }, labelBy: 'owner', confirmedAt: '2026-10-24T00:00:00.000Z' };
    expect(carryLabels([confirmed], [c!])[0]).toMatchObject({ labelBy: 'owner' });
    expect(carryLabels([{ ...confirmed, input: { other: 1 } }], [c!])[0]).toMatchObject({ labelBy: null });
  });
});
