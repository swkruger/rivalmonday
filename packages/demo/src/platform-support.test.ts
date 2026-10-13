import { supportSession } from '@cs/db';
import { openTestDbs } from '@cs/db/test-helpers';
import { createMemoryStore } from '@cs/storage';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createSeedContext, type SeedContext } from './context';
import { seedSupportSessions } from './platform-support';
import { seedTenancy } from './tenancy';
import { resetDemoTables, TEST_SALT } from './test-support';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
let ctx: SeedContext;

beforeAll(async () => {
  await resetDemoTables(dbs.owner);
  ctx = createSeedContext({ db: dbs.owner, store: createMemoryStore(), now: new Date(), salt: TEST_SALT });
  await seedTenancy(ctx);
});

describe('seedSupportSessions', () => {
  it('writes one exit and one expired ended session for the demo operator, and is idempotent', async () => {
    await seedSupportSessions(ctx);
    await seedSupportSessions(ctx);
    const rows = await dbs.owner.select().from(supportSession).where(eq(supportSession.agencyId, ctx.ids.agencyId));
    expect(rows.map((r) => r.endReason).sort()).toEqual(['exit', 'expired']);
    for (const r of rows) {
      expect(r.platformUserId).toBe(ctx.ids.users.operator.userId);
      expect(r.endedAt).not.toBeNull();
      expect(r.endedAt!.getTime()).toBeLessThanOrEqual(r.expiresAt.getTime());
      expect(r.expiresAt.getTime()).toBeLessThan(ctx.clock.now.getTime());
    }
  });
});
