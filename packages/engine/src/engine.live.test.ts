import { createAiFromEnv, DEFAULT_AI_CONFIG_PATH, loadAiConfigFile } from '@cs/ai';
import { redactForModel } from '@cs/collectors';
import type { LlmCallRecord } from '@cs/core';
import { loadVerticalPack } from '@cs/verticals';
import { describe, expect, it } from 'vitest';
import { diffFacts, extractNumericFacts } from './facts/numeric';
import { buildPriceQuestions } from './prices/price-stage';
import { buildReviewQuestions, resolveReviewAnalysis } from './reviews/themes';
import { buildTagQuestions, buildTagState, resolveTag, serviceQuestionKey } from './tag/questions';
import { TAG_DECISION_TASK } from './tag/tag-stage';
import { cosine, SEMANTIC_THRESHOLD } from './web/diff-stage';

const key = process.env.OPENROUTER_API_KEY;

// Contract test against the real models (≈ $0.001). Runs only when OPENROUTER_API_KEY is set.
describe.skipIf(!key)('engine models (live)', () => {
  const records: LlmCallRecord[] = [];
  const ledger = { recordLlmCall: async (r: LlmCallRecord) => { records.push(r); }, recordVendorCall: async () => {} };
  const scope = { agencyId: null, clientId: null };

  it('embeddings: punctuation stays above the semantic threshold; unrelated text falls far below', async () => {
    const ai = createAiFromEnv(process.env, await loadAiConfigFile(DEFAULT_AI_CONFIG_PATH), ledger);
    const base = 'Spring AC tune-up only $89. Book online today.';
    const { vectors } = await ai.embed('embeddings', [base, 'Spring AC tune-up only $89. Book online today!', 'Spring AC tune-up now just $69. Book online today.', 'We now serve Plano, Frisco and McKinney.'], scope);
    expect(vectors.every((v) => v.length === 512)).toBe(true);
    const [punct, price, unrelated] = [cosine(vectors[0]!, vectors[1]!), cosine(vectors[0]!, vectors[2]!), cosine(vectors[0]!, vectors[3]!)];
    console.log(`[live] cosine punctuation=${punct.toFixed(3)} price=${price.toFixed(3)} unrelated=${unrelated.toFixed(3)}`);
    expect(punct).toBeGreaterThanOrEqual(SEMANTIC_THRESHOLD);
    expect(unrelated).toBeLessThan(0.6);
    expect(records.some((r) => r.task === 'embeddings' && r.ok)).toBe(true);
  }, 30_000);

  it('decisions: tags a real price cut as a meaningful price change on AC tune-ups', async () => {
    const ai = createAiFromEnv(process.env, await loadAiConfigFile(DEFAULT_AI_CONFIG_PATH), ledger);
    const packs = [await loadVerticalPack('hvac_plumbing')];
    const numeric = diffFacts(extractNumericFacts('AC Tune-Up Only $89 per system'), extractNumericFacts('AC Tune-Up Only $69 per system'));
    const state = buildTagState({ competitorName: 'Smith HVAC', pageUrl: 'https://smithhvac.example/', pageType: 'home', kind: 'modified', beforeText: 'AC Tune-Up Only $89 per system', afterText: 'AC Tune-Up Only $69 per system', numericChanges: numeric });
    const result = await ai.decide(TAG_DECISION_TASK, state, buildTagQuestions(packs), scope);
    const r = resolveTag(numeric, result, packs);
    console.log(`[live] tag ${JSON.stringify({ ...r, providers: Object.fromEntries(Object.entries(result.answers).map(([k, v]) => [k, `${v.provider}:${v.confidence.toFixed(2)}`])) })}`);
    expect(r.meaningful).toBe(true);
    expect(['price_change', 'promo']).toContain(r.type);
    expect(r.services.hvac_plumbing).toBe('ac_tune_up');
  }, 60_000);

  it('review decisions: a hidden-fee complaint is about price transparency and negative', async () => {
    const ai = createAiFromEnv(process.env, await loadAiConfigFile(DEFAULT_AI_CONFIG_PATH), ledger);
    const pack = await loadVerticalPack('hvac_plumbing');
    const verticals = [{ pack, themes: pack.themes.map((t) => ({ id: t.id, name: t.name, description: t.description })) }];
    const text = 'Quoted $150 on the phone but the bill was $400 with fees nobody mentioned. Thanks Mike for being polite, I guess.';
    const state = { business_type: pack.name, rating: 1, review: redactForModel(text, { businessNames: ['Smith HVAC'] }) };
    expect(state.review).not.toContain('Mike');
    const result = await ai.decide('review_decisions', state, buildReviewQuestions(verticals), scope);
    const [row] = resolveReviewAnalysis(result, verticals, { reviewId: 'live', competitorId: 'live', textSha: 'live' });
    console.log(`[live] review ${JSON.stringify({ themes: row!.themes, sentiment: row!.sentiment, providers: Object.fromEntries(Object.entries(result.answers).map(([k, v]) => [k, `${v.provider}:${v.confidence.toFixed(2)}`])) })}`);
    expect(row!.themes).toContain('price_transparency');
    expect(row!.sentiment).not.toBeNull();
    expect(row!.sentiment!).toBeLessThanOrEqual(1);
  }, 60_000);

  it('price decisions: a priced block maps to its service', async () => {
    const ai = createAiFromEnv(process.env, await loadAiConfigFile(DEFAULT_AI_CONFIG_PATH), ledger);
    const pack = await loadVerticalPack('hvac_plumbing');
    const state = { competitor: 'Smith HVAC', page_url: 'https://smithhvac.example/pricing', page_type: 'pricing', text: 'AC tune-up starting at $89 per system', prices: ['$89 per system'] };
    const result = await ai.decide('price_decisions', state, buildPriceQuestions([pack]), scope);
    console.log(`[live] price ${JSON.stringify(result.answers)}`);
    expect(result.answers[serviceQuestionKey('hvac_plumbing')]?.value).toBe('ac_tune_up');
  }, 60_000);
});
