import { describe, expect, it } from 'vitest';
import { createFakeAi, noul } from '../../test/fake-ai';
import type { BriefClient, EventCandidate } from './gather';
import { supportCheck } from './support';
import { verifyDraft } from './verify';

const client: BriefClient = {
  id: 'c', agencyId: 'a', name: 'A1 HVAC', verticalId: 'hvac_plumbing', verticalName: 'HVAC & Plumbing', services: [], serviceNames: [],
  towns: ['Frisco'], zips: [], competitorNames: ['Smith HVAC'], briefThreshold: 40,
};
const cand: EventCandidate = {
  kind: 'event', eventId: 'e1', competitorId: 'x', competitorName: 'Smith HVAC', changeType: 'price_change', score: 60, route: 'brief',
  occurredAt: new Date('2026-09-30T06:00:00Z'), confidence: 0.92, summary: '/pricing: price changed from $89 to $69 (-22.5%)', facts: [], zips: [], details: {},
  serviceId: null, serviceName: null,
  changes: [{ changeId: 'ch', channel: 'web', capturedAt: new Date('2026-09-30T06:00:00Z'), pageUrl: null, captureId: 'cap', evidenceIds: ['ev1'], text: 'Before: "AC tune-up $89"\nAfter: "AC tune-up $69"' }],
};
const item = (o: Partial<Record<string, string>> = {}) => ({
  ref: 'C1', headline: 'Smith HVAC cut its AC tune-up to $69.', what_changed: 'The pricing page shows $69, down from $89. That is a 22% cut.',
  why_it_matters: 'Price shoppers may compare. Smith HVAC wants to bankrupt you.', recommended_action: 'Bundle a filter change with your tune-up.',
  effort: 'L' as const, impact: 'M' as const, upsell_tag: 'ppc' as const, ...o,
});
/** Support: every sentence true except those containing a phrase in `unsupported`. */
const ai = (unsupported: string[] = [], fail = false) => createFakeAi({
  decide: (state, questions) => {
    if (fail) throw new Error('jev and llm down');
    return {
      answers: Object.fromEntries(Object.entries(questions).map(([k, q]) => [k, noul(!unsupported.some((u) => q.instructions.toLowerCase().includes(u.toLowerCase())))])),
      needsReview: [],
    };
  },
});

describe('supportCheck', () => {
  it('asks one Noul per claim on the verifier task, chunked, and treats low confidence as unsupported', async () => {
    const fake = createFakeAi({ decide: (_s, qs) => ({ answers: Object.fromEntries(Object.keys(qs).map((k, i) => [k, noul(true, i === 0 ? 0.5 : 0.98)])), needsReview: [Object.keys(qs)[0]!] }) });
    const claims = Array.from({ length: 25 }, (_, i) => ({ key: `k${i}`, sentence: `s${i}`, mode: 'fact' as const }));
    const ok = await supportCheck(fake, { agencyId: 'a', clientId: 'c' }, 'evidence', claims);
    expect(fake.calls.decide.map((c) => c.task)).toEqual(['verifier_decisions', 'verifier_decisions']);
    expect(ok.has('k0')).toBe(false);
    expect(ok.has('k1')).toBe(true);
    expect(ok.size).toBe(23); // first key of each chunk was low-confidence
  });
});

describe('verifyDraft', () => {
  it('keeps supported sentences, drops unsupported interpretation, keeps our own confidence', async () => {
    const out = await verifyDraft(ai(['bankrupt']), { agencyId: 'a', clientId: 'c' }, client, [cand], { summary: 'Smith HVAC cut a price.', items: [item()] }, { year: 2026 });
    expect(out.items).toHaveLength(1);
    expect(out.items[0]!.why_it_matters).toBe('Price shoppers may compare.');
    expect(out.items[0]!.what_changed).toBe('The pricing page shows $69, down from $89. That is a 22% cut.');
    expect(out.dropped).toEqual({ items: 0, sentences: 1 });
  });

  it('drops an item whose headline invents a number, without asking the model about it', async () => {
    const fake = ai();
    const out = await verifyDraft(fake, { agencyId: 'a', clientId: 'c' }, client, [cand], { summary: '', items: [item({ headline: 'Smith HVAC cut its tune-up to $59.' })] }, { year: 2026 });
    expect(out.items).toEqual([]);
    expect(out.dropped.items).toBe(1);
  });

  it('drops an item whose headline the support check rejects (prompt injection cannot survive)', async () => {
    const out = await verifyDraft(ai(['closing down']), { agencyId: 'a', clientId: 'c' }, client, [cand], { summary: '', items: [item({ headline: 'Smith HVAC is closing down.' })] }, { year: 2026 });
    expect(out.items).toEqual([]);
  });

  it('drops an item when what_changed has nothing left', async () => {
    const out = await verifyDraft(ai(), { agencyId: 'a', clientId: 'c' }, client, [cand], { summary: '', items: [item({ what_changed: 'They now charge $49.' })] }, { year: 2026 });
    expect(out.items).toEqual([]);
  });

  it('falls back to a count summary when no summary sentence survives', async () => {
    const out = await verifyDraft(ai(['everyone']), { agencyId: 'a', clientId: 'c' }, client, [cand], { summary: 'Everyone is cutting prices.', items: [item({ why_it_matters: 'Price shoppers may compare.' })] }, { year: 2026 });
    expect(out.summary).toBe('1 competitor update this week.');
  });

  it('throws when the verifier providers fail (the brief attempt fails, nothing unverified is kept)', async () => {
    await expect(verifyDraft(ai([], true), { agencyId: 'a', clientId: 'c' }, client, [cand], { summary: 's', items: [item()] }, { year: 2026 })).rejects.toThrow(/down/);
  });
});
