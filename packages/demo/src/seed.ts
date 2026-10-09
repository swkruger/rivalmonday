import { assertDatabase, createDb } from '@cs/db';
import type { ObjectStore } from '@cs/storage';
import { sql } from 'drizzle-orm';
import { seedAds } from './ads';
import { seedAgency } from './agency';
import { seedBriefs } from './briefs';
import { seedChanges } from './changes';
import { createSeedContext, type SeedContext } from './context';
import type { DemoIds } from './ids';
import { seedPlatform } from './platform';
import { seedPricing } from './pricing';
import { seedRankings } from './rankings';
import { seedReviews } from './reviews';
import { seedTenancy } from './tenancy';

export interface SeedDemoOptions {
  /** Owner URL of the database to seed. */
  ownerUrl: string;
  /** Spec §8: `demo:reset` passes 'cs_demo'; the coverage test passes the cs_test name. */
  expected: string;
  store: ObjectStore;
  salt: string;
  now?: Date;
  log?: (line: string) => void;
}

/** In dependency order: later areas read ids the earlier ones wrote (briefs read events, moves, reviews and ads). */
const STEPS: readonly [string, (ctx: SeedContext) => Promise<void>][] = [
  ['tenancy and people', seedTenancy],
  ['changes, evidence and moves', seedChanges],
  ['pricing', seedPricing],
  ['ads', seedAds],
  ['reviews', seedReviews],
  ['rankings', seedRankings],
  ['briefs, alerts and reports', seedBriefs],
  ['agency', seedAgency],
  ['platform queues', seedPlatform],
];

/** Spec §4: fills an empty, migrated database with the fictional demo set. Both guards run before anything is written. */
export async function seedDemo(o: SeedDemoOptions): Promise<DemoIds> {
  // Guard 1, before connecting: the URL must name exactly the expected database.
  assertDatabase(o.ownerUrl, o.expected);
  const log = o.log ?? (() => {});
  const { db, close } = createDb(o.ownerUrl);
  try {
    // Guard 2: the server agrees on the name, and the database holds no agency yet.
    const [row] = [...(await db.execute<{ name: string; agencies: number }>(sql`select current_database() as name, (select count(*)::int from agency) as agencies`))];
    if (row?.name !== o.expected) throw new Error(`Refusing to seed database "${row?.name}": expected exactly "${o.expected}"`);
    if (Number(row.agencies) > 0) throw new Error(`Refusing to seed ${o.expected}: it already has data (wipe it first)`);
    const ctx = createSeedContext({ db, store: o.store, now: o.now ?? new Date(), salt: o.salt, log });
    for (const [label, step] of STEPS) {
      log(`[seed] ${label}…`);
      await step(ctx);
    }
    log(`[seed] done: ${ctx.ids.events.length} events, ${ctx.ids.moves.length} moves`);
    return ctx.ids;
  } finally {
    await close();
  }
}
