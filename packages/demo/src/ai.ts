import { generatePat } from '@cs/core/server';
import { apiToken } from '@cs/db';
import type { SeedContext } from './context';

/**
 * Phase 6a "AI connections": one client-bound token for the Lone Star owner and one agency-wide token for the admin.
 * Only the hash and prefix are stored; the plaintext is discarded, so no demo token can ever be used.
 * OAuth grants are not seeded: they need a real AI app to connect.
 */
export async function seedAi(ctx: SeedContext): Promise<void> {
  const { db, ids, clock } = ctx;
  const rows = [
    { user: ids.users.ownerLoneStar.userId, clientId: ids.clients.loneStar, name: 'Claude Code on my laptop', scope: 'feedback' as const, createdAt: clock.daysAgo(12), lastUsedAt: clock.daysAgo(1) },
    { user: ids.users.admin.userId, clientId: null, name: 'Agency reporting script', scope: 'read' as const, createdAt: clock.daysAgo(5), lastUsedAt: null },
  ];
  await db.insert(apiToken).values(rows.map((r) => {
    const { hash, prefix } = generatePat();
    return { agencyId: ids.agencyId, userId: r.user, clientId: r.clientId, name: r.name, tokenHash: hash, tokenPrefix: prefix, scope: r.scope, createdAt: r.createdAt, lastUsedAt: r.lastUsedAt };
  }));
}
