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
  // In-process rate limiting: per-host politeness (spec §4.2) only holds with exactly one worker
  // replica. The deployment is a single always-on worker container by design; scaling out to
  // multiple replicas would need a shared (e.g. DB- or Redis-backed) limiter instead of this one.
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
  // A rejected init must not be cached forever (the worker keeps this deps object alive for its
  // whole lifetime): clear it so the next discoverPages call retries instead of replaying the same failure.
  const getAi = () =>
    (ai ??= loadAiConfigFile(DEFAULT_AI_CONFIG_PATH)
      .then((cfg) => createAiFromEnv(env, cfg, createLedgerSink(getDb())))
      .catch((err) => {
        ai = null;
        throw err;
      }));

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
