import 'server-only';
import { type Ai, createAiFromEnv, DEFAULT_AI_CONFIG_PATH, loadAiConfigFile } from '@cs/ai';
import type { VoiceSettings } from '@cs/core';
import { createAiGuard, createLedgerSink, type Db, type EnvName } from '@cs/db';
import { writeVoicePreview } from '@cs/engine';
import type { ToolDeps } from '@cs/tools';

type Preview = NonNullable<ToolDeps['voicePreview']>;

const TONE_WORD: Record<VoiceSettings['tone'], string> = { friendly: 'friendly', formal: 'formal', direct: 'direct' };

/** What E2E and DEMO answer with, never a paid call: deterministic, in the draft's tone, using the first preferred term. */
export const fixtureVoicePreview: Preview = async (voice) => {
  const term = voice.preferredTerms[0]?.say;
  const use = term ? ` We chose to say "${term}" here.` : '';
  return `Sample alert in a ${TONE_WORD[voice.tone]} voice: a rival lowered a price this week.${use}`;
};

/** Fixture under SETUP_FAKE_LOOKUP and in DEMO/TEST; the real preview needs an OpenRouter key, else absent (the tool then refuses with a user-facing message). An `AiPausedError` propagates so the registry answers with the pause copy. */
export function voicePreviewFor(name: EnvName, service: Db, env: { fake: boolean; processEnv: NodeJS.ProcessEnv }): Preview | undefined {
  if (env.fake || name === 'demo' || name === 'test') return fixtureVoicePreview;
  if (!env.processEnv.OPENROUTER_API_KEY) return undefined;
  let ai: Promise<Ai> | undefined;
  const client = () => {
    ai ??= loadAiConfigFile(DEFAULT_AI_CONFIG_PATH).then((cfg) => createAiFromEnv(env.processEnv, cfg, createLedgerSink(service), undefined, createAiGuard(service)));
    return ai.catch((e: unknown) => {
      ai = undefined; // do not cache a failed build
      throw e;
    });
  };
  return async (voice, scope) => writeVoicePreview(await client(), scope, voice);
}
