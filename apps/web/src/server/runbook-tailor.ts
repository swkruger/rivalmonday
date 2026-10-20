import 'server-only';
import { type Ai, createAiFromEnv, DEFAULT_AI_CONFIG_PATH, loadAiConfigFile } from '@cs/ai';
import { createLedgerSink, type Db, type EnvName } from '@cs/db';
import { proposeTailoring } from '@cs/engine';
import type { ToolDeps } from '@cs/tools';
import type { Catalog } from '@cs/verticals';

type Tailorer = NonNullable<ToolDeps['runbookTailorer']>;

/** What E2E and DEMO answer with, never a paid call: the parent's wording, marked as re-tailored. */
export const fixtureRunbookTailorer: Tailorer = async ({ parentContent }) => {
  const c = parentContent as { title?: unknown; template?: unknown } | null;
  if (typeof c?.title !== 'string' || typeof c.template !== 'string') return null;
  return { title: `${c.title} (tailored)`.slice(0, 200), template: c.template, businessAreaIds: null };
};

/** Fixture under SETUP_FAKE_LOOKUP and in DEMO/TEST; the real tailorer needs an OpenRouter key, else absent (the tool then answers `proposed: null`). */
export function runbookTailorerFor(name: EnvName, service: Db, catalog: Catalog, env: { fake: boolean; processEnv: NodeJS.ProcessEnv }): Tailorer | undefined {
  if (env.fake || name === 'demo' || name === 'test') return fixtureRunbookTailorer;
  if (!env.processEnv.OPENROUTER_API_KEY) return undefined;
  let ai: Promise<Ai> | undefined;
  const client = () => {
    ai ??= loadAiConfigFile(DEFAULT_AI_CONFIG_PATH).then((cfg) => createAiFromEnv(env.processEnv, cfg, createLedgerSink(service)));
    return ai.catch((e: unknown) => {
      ai = undefined; // do not cache a failed build
      throw e;
    });
  };
  return async ({ clientId, key, parentContent }) => {
    try {
      return await proposeTailoring({ db: service, ai: await client(), packs: catalog.packs }, clientId, key, parentContent);
    } catch (e) {
      console.warn(`[runbook-tailor] ${key} for ${clientId} failed: ${e instanceof Error ? e.name : 'unknown'}`);
      return null;
    }
  };
}
