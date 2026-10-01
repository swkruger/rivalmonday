import type { LedgerSink } from '@cs/core';
import { type Ai, createAi } from './ai';
import type { AiConfig } from './config';
import { createJevProvider } from './decisions/jev';
import { createOpenRouterEmbeddings } from './embeddings';
import { createOpenRouterProvider, type OpenRouterOptions } from './openrouter';

export function createAiFromEnv(env: NodeJS.ProcessEnv, config: AiConfig, ledger: LedgerSink): Ai {
  const apiKey = env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY is required');
  const router: OpenRouterOptions = {
    apiKey,
    appName: config.openrouter.app_name,
    appUrl: env.APP_URL ?? 'http://localhost:3000',
    dataCollection: config.openrouter.data_collection,
    zdr: config.openrouter.zdr,
  };
  const jevKey = env.TYPESAFE_API_KEY;
  const jev = jevKey
    ? (model: string) => createJevProvider({ apiKey: jevKey, model, inputUsdPerMTok: config.jev.input_usd_per_mtok })
    : null;
  return createAi(config, { openrouter: createOpenRouterProvider(router), embeddings: createOpenRouterEmbeddings(router), jev, ledger });
}
