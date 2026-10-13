import { and, eq } from 'drizzle-orm';
import { supportSession } from '@cs/db';
import type { SeedContext } from './context';

const HOUR = 3_600_000;
const MINUTE = 60_000;

/**
 * Phase 8b: two ended read-only support sessions on the demo agency, opened by the demo platform operator, so the
 * agency's Platform access page and the console's Support sessions table have rows. One ended through Exit, one ran
 * out. Idempotent: the operator's rows for this agency are replaced, so a re-seed never leaves duplicates (and never
 * trips the one-open-session index, since both rows are ended).
 */
export async function seedSupportSessions(ctx: SeedContext): Promise<void> {
  const agencyId = ctx.ids.agencyId;
  const platformUserId = ctx.ids.users.operator.userId;
  const now = ctx.clock.now.getTime();
  const exitStart = new Date(now - 9 * 24 * HOUR - 2 * HOUR);
  const expiredStart = new Date(now - 3 * 24 * HOUR - 5 * HOUR);
  await ctx.db.transaction(async (tx) => {
    await tx.delete(supportSession).where(and(eq(supportSession.agencyId, agencyId), eq(supportSession.platformUserId, platformUserId)));
    await tx.insert(supportSession).values([
      {
        platformUserId, agencyId, reason: 'Customer reported the weekly brief email arrived without evidence links',
        startedAt: exitStart, expiresAt: new Date(exitStart.getTime() + 60 * MINUTE),
        endedAt: new Date(exitStart.getTime() + 24 * MINUTE), endReason: 'exit',
      },
      {
        platformUserId, agencyId, reason: 'Checking why the Brazos competitor list shows a stale ranking scan',
        startedAt: expiredStart, expiresAt: new Date(expiredStart.getTime() + 60 * MINUTE),
        endedAt: new Date(expiredStart.getTime() + 60 * MINUTE), endReason: 'expired',
      },
    ]);
  });
}
