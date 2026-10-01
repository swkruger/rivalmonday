import { type Ai, createAiFromEnv, DEFAULT_AI_CONFIG_PATH, loadAiConfigFile } from '@cs/ai';
import {
  capturePage, claimDuePages, createPlaywrightRenderer, createPoliteRenderer, defaultFetchText, discoverPages, HostRateLimiter,
  type Renderer, RobotsPolicy,
} from '@cs/collectors';
import type { CaptureStatus } from '@cs/core';
import { competitor, createDb, createLedgerSink, type Db } from '@cs/db';
import { createStoreFromEnv, type ObjectStore } from '@cs/storage';
import { eq } from 'drizzle-orm';

export interface WorkerDeps {
  claimDuePages(limit: number): Promise<string[]>;
  capturePage(trackedPageId: string): Promise<{ status: CaptureStatus | 'missing' }>;
  discoverPages(competitorId: string): Promise<{ selected: number; candidates: number; homepageStatus: string } | { skipped: string }>;
  close(): Promise<void>;
}

/** Everything is created lazily so importing this module has no side effects. */
export function createWorkerDeps(env: NodeJS.ProcessEnv): WorkerDeps {
  let db: { db: Db; close(): Promise<void> } | null = null;
  let store: ObjectStore | null = null;
  let renderer: Renderer | null = null;
  let ai: Promise<Ai> | null = null;
  const robots = new RobotsPolicy(defaultFetchText);
  const limiter = new HostRateLimiter();

  const getDb = () => {
    if (!db) {
      const url = env.SERVICE_DATABASE_URL;
      if (!url) throw new Error('SERVICE_DATABASE_URL is required');
      db = createDb(url);
    }
    return db.db;
  };
  const getStore = () => (store ??= createStoreFromEnv(env));
  const getRenderer = () => (renderer ??= createPoliteRenderer({ robots, limiter, renderer: createPlaywrightRenderer() }));
  const getAi = () => (ai ??= loadAiConfigFile(DEFAULT_AI_CONFIG_PATH).then((cfg) => createAiFromEnv(env, cfg, createLedgerSink(getDb()))));

  return {
    claimDuePages: (limit) => claimDuePages(getDb(), limit),
    capturePage: (id) => capturePage({ db: getDb(), store: getStore(), renderer: getRenderer() }, id),
    async discoverPages(competitorId) {
      const [c] = await getDb().select().from(competitor).where(eq(competitor.id, competitorId)).limit(1);
      if (!c?.domain) return { skipped: 'competitor has no domain' };
      return discoverPages({ db: getDb(), renderer: getRenderer(), robots, fetchText: defaultFetchText, limiter, ai: await getAi() }, { id: c.id, domain: c.domain });
    },
    async close() {
      await renderer?.close();
      await db?.close();
    },
  };
}
