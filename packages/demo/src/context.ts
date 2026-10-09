import type { Db } from '@cs/db';
import type { ObjectStore } from '@cs/storage';
import { createClock, type DemoClock } from './clock';
import { type DemoIds, emptyIds } from './ids';
import { DEMO_SEED, hashString, Rng } from './random';

export interface SeedContext {
  /** Owner connection (BYPASSRLS) to the database being seeded. */
  db: Db;
  /** Evidence store of that database (the DEMO directory, or a memory/temp store in tests). */
  store: ObjectStore;
  clock: DemoClock;
  /** REVIEWER_HASH_SALT (spec §4.5: reviewer hashes use the normal salt function). */
  salt: string;
  log: (line: string) => void;
  ids: DemoIds;
  /** A fresh, deterministic stream for one area. */
  rng(area: string): Rng;
}

export function createSeedContext(o: { db: Db; store: ObjectStore; now: Date; salt: string; log?: (line: string) => void }): SeedContext {
  return {
    db: o.db, store: o.store, clock: createClock(o.now), salt: o.salt, log: o.log ?? (() => {}), ids: emptyIds(),
    rng: (area) => new Rng(DEMO_SEED ^ hashString(area)),
  };
}
