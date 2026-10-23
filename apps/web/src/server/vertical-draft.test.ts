import type { Ai } from '@cs/ai';
import { AiPausedError } from '@cs/core';
import type { DataForSeoClient } from '@cs/collectors';
import type { Catalog } from '@cs/verticals';
import { describe, expect, it, vi } from 'vitest';
import { DRAFT_SYSTEM_PROMPT, createVerticalDrafter, fixtureVerticalDrafter, verticalDraftJsonSchema, verticalDrafterFor } from './vertical-draft';

vi.mock('@cs/collectors', async (orig) => ({
  ...(await orig<typeof import('@cs/collectors')>()),
  fetchGbpProfile: vi.fn(async () => ({
    title: 'Oak Barrel Distillery', category: 'Distillery', additionalCategories: ['Liquor store'], description: 'Barrel tastings every Friday. Call 817-555-0100.',
    services: null, attributes: null,
  })),
}));

const scope = { agencyId: 'a', clientId: null, verticalId: 'draft:p1' };
const answer = (text: string) => ({ chat: vi.fn(async () => ({ text })) }) as unknown as Ai & { chat: ReturnType<typeof vi.fn> };
const good = JSON.stringify({
  name: 'Craft distilleries', audienceNoun: 'guests', areas: [{ name: 'Tastings', aliases: [], quote: 'Barrel tastings every Friday' }, { name: 'Weddings', aliases: [], quote: 'wedding hire' }],
  seedKeywords: [], categories: ['Distillery', 'Brewery'], relatedCategories: ['Liquor store'], topics: [],
});
const make = (ai: Ai) => createVerticalDrafter({
  dfs: () => ({}) as DataForSeoClient, ai: async () => ai,
  catalogue: async () => [{ id: 'craft_distillery', name: 'Craft distillery', categories: [] }, { id: 'dental', name: 'Dental', categories: [] }],
});

describe('createVerticalDrafter', () => {
  it('calls the model once with the call scope, redacts contact info and business names, validates quotes and finds similar types', async () => {
    const ai = answer(good);
    const out = await make(ai)({ placeId: 'p1', nearbyCategories: ['Distillery'] }, scope);
    expect(ai.chat).toHaveBeenCalledTimes(1);
    const [task, req, sentScope] = ai.chat.mock.calls[0] as [string, { messages: { content: string }[] }, unknown];
    expect(task).toBe('vertical_draft');
    expect(sentScope).toEqual(scope);
    expect(req.messages[1]!.content).not.toContain('817-555-0100');
    expect(req.messages[1]!.content).not.toContain('Oak Barrel');
    expect(out.draft?.areas.map((a) => a.name)).toEqual(['Tastings']);
    expect(out.draft?.categories).toEqual(['Distillery']);
    expect(out.similar.map((s) => s.id)).toEqual(['craft_distillery']);
  });

  it('answers draft: null for bad JSON, a failed model call or a draft with no surviving area', async () => {
    expect((await make(answer('not json'))({ placeId: 'p1', nearbyCategories: [] }, scope)).draft).toBeNull();
    const down = { chat: vi.fn(async () => { throw new Error('down'); }) } as unknown as Ai;
    expect(await make(down)({ placeId: 'p1', nearbyCategories: [] }, scope)).toEqual({ draft: null, similar: [] });
    const invented = answer(JSON.stringify({ ...JSON.parse(good), areas: [{ name: 'Weddings', aliases: [], quote: 'wedding hire' }] }));
    expect((await make(invented)({ placeId: 'p1', nearbyCategories: [] }, scope)).draft).toBeNull();
  });
});

describe('createVerticalDrafter and the AI guard (7b1)', () => {
  it('rethrows AiPausedError (the tool registry maps it to the S1/C5 copy) instead of answering draft: null', async () => {
    for (const reason of ['platform', 'client'] as const) {
      const paused = { chat: vi.fn(async () => { throw new AiPausedError(reason); }) } as unknown as Ai;
      await expect(make(paused)({ placeId: 'p1', nearbyCategories: [] }, scope)).rejects.toBeInstanceOf(AiPausedError);
    }
  });
});

describe('verticalDrafterFor', () => {
  const svc = {} as never;
  const cat = {} as Catalog;
  it('returns the Distillery fixture (5 areas) under the fake flag and in demo/test', async () => {
    expect(verticalDrafterFor('dev', svc, cat, { fake: true, processEnv: {} as NodeJS.ProcessEnv })).toBe(fixtureVerticalDrafter);
    expect(verticalDrafterFor('test', svc, cat, { fake: false, processEnv: {} as NodeJS.ProcessEnv })).toBe(fixtureVerticalDrafter);
    expect((await fixtureVerticalDrafter({ placeId: 'x', nearbyCategories: [] }, scope)).draft?.areas).toHaveLength(5);
  });
  it('is absent in dev without credentials', () => {
    expect(verticalDrafterFor('dev', svc, cat, { fake: false, processEnv: {} as NodeJS.ProcessEnv })).toBeUndefined();
  });
});

describe('draft wording', () => {
  it('asks the model for topics, not themes', () => {
    expect(DRAFT_SYSTEM_PROMPT).toMatch(/topic/);
    expect(DRAFT_SYSTEM_PROMPT).not.toMatch(/theme/i);
    expect(JSON.stringify(verticalDraftJsonSchema)).toContain('"topics"');
    expect(JSON.stringify(verticalDraftJsonSchema)).not.toMatch(/theme/i);
  });
});
