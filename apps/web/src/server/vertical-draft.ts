import 'server-only';
import { type Ai, createAiFromEnv, DEFAULT_AI_CONFIG_PATH, type JsonSchemaFormat, loadAiConfigFile } from '@cs/ai';
import { createDataForSeo, DFS_BASE_URL, type DataForSeoClient, fetchGbpProfile, redactForModel } from '@cs/collectors';
import { createAiGuard, createLedgerSink, type Db, type EnvName } from '@cs/db';
import { buildSuggestionSource, type ToolDeps } from '@cs/tools';
import { type Catalog, similarVerticals, validateDraft, type VerticalDraft } from '@cs/verticals';
import fixture from '../../e2e/fixtures/vertical-draft.json';

type VerticalDrafter = NonNullable<ToolDeps['verticalDrafter']>;

/** The Distillery draft E2E and DEMO answer with, never a paid call. */
export const fixtureVerticalDrafter: VerticalDrafter = async () => ({ draft: fixture as VerticalDraft, similar: [] });

const quoted = (extra: Record<string, unknown> = {}) => ({ type: 'string', ...extra });
export const verticalDraftJsonSchema: JsonSchemaFormat = {
  name: 'vertical_draft',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['name', 'audienceNoun', 'areas', 'seedKeywords', 'categories', 'relatedCategories', 'topics'],
    properties: {
      name: quoted(),
      audienceNoun: quoted(),
      areas: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['name', 'aliases', 'quote'], properties: { name: quoted(), aliases: { type: 'array', items: quoted() }, quote: quoted() } } },
      seedKeywords: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['value', 'quote'], properties: { value: quoted(), quote: quoted() } } },
      categories: { type: 'array', items: quoted() },
      relatedCategories: { type: 'array', items: quoted() },
      topics: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['name', 'quote'], properties: { name: quoted(), quote: quoted() } } },
    },
  },
};

export const DRAFT_SYSTEM_PROMPT =
  'You describe a type of local business so a competitor-monitoring tool can track it. From the Google profile text below, propose: a short business-type name (no business names, places or people), the word for its customers, 3–12 service offers with common alternative names, up to 5 search keywords customers use, review topics, and which of the listed Google categories belong to this type. Quote the exact words from the text that support every service, keyword and topic. Use only the text given.';

/** One AI call over the profile text. Any failure (vendor, model, bad JSON) is `draft: null`, never a throw: the UI then shows the manual form. */
export function createVerticalDrafter(d: { dfs: () => DataForSeoClient; ai: () => Promise<Ai>; catalogue: () => Promise<{ id: string; name: string; categories: string[] }[]> }): VerticalDrafter {
  return async (input, scope) => {
    try {
      const gbp = await fetchGbpProfile(d.dfs(), { placeId: input.placeId }, scope);
      if (!gbp) return { draft: null, similar: [] };
      const catalogue = await d.catalogue();
      const categories = [...new Set([gbp.category, ...gbp.additionalCategories, ...input.nearbyCategories].filter((c): c is string => Boolean(c?.trim())))];
      const base = buildSuggestionSource(gbp, []).text;
      const text = redactForModel(`${base}\nNearby categories: ${input.nearbyCategories.join(', ')}\nGoogle categories: ${categories.join(', ')}`, { businessNames: [gbp.title] });
      const ai = await d.ai();
      const res = await ai.chat('vertical_draft', { messages: [{ role: 'system', content: DRAFT_SYSTEM_PROMPT }, { role: 'user', content: text }], jsonSchema: verticalDraftJsonSchema }, scope);
      let raw: unknown = null;
      try {
        raw = JSON.parse(res.text);
      } catch {
        raw = null;
      }
      const draft = validateDraft(raw, { text, categories });
      return { draft, similar: similarVerticals(draft?.name ?? gbp.category ?? '', catalogue) };
    } catch (e) {
      console.error(`[vertical-draft] ${input.placeId} failed: ${e instanceof Error ? e.name : 'unknown'}`);
      return { draft: null, similar: [] };
    }
  };
}

/** Fixture under SETUP_FAKE_LOOKUP and in DEMO/TEST; the real drafter needs DataForSEO and OpenRouter credentials, else absent (the tool then answers `draft: null`). */
export function verticalDrafterFor(name: EnvName, service: Db, catalog: Catalog, env: { fake: boolean; processEnv: NodeJS.ProcessEnv }): VerticalDrafter | undefined {
  if (env.fake || name === 'demo' || name === 'test') return fixtureVerticalDrafter;
  const { DATAFORSEO_LOGIN: login, DATAFORSEO_PASSWORD: password, DATAFORSEO_BASE_URL: baseUrl, OPENROUTER_API_KEY: key } = env.processEnv;
  if (!login || !password || !key) return undefined;
  let dfs: DataForSeoClient | undefined;
  let ai: Promise<Ai> | undefined;
  return createVerticalDrafter({
    dfs: () => (dfs ??= createDataForSeo({ login, password, baseUrl: baseUrl || DFS_BASE_URL, ledger: createLedgerSink(service) })),
    ai: () => {
      ai ??= loadAiConfigFile(DEFAULT_AI_CONFIG_PATH).then((cfg) => createAiFromEnv(env.processEnv, cfg, createLedgerSink(service), undefined, createAiGuard(service)));
      return ai.catch((e: unknown) => {
        ai = undefined; // do not cache a failed build
        throw e;
      });
    },
    catalogue: async () => (await catalog.list()).map((v) => ({ id: v.id, name: v.name, categories: [] })),
  });
}
