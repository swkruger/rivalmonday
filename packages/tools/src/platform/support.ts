import { isUuid, ToolError } from '@cs/core';
import { agency, type Db, supportSession } from '@cs/db';
import { and, eq, isNull } from 'drizzle-orm';
import type { ToolDeps } from '../deps';
import { platformRoleForUser } from '../platform';
import { isUniqueViolation } from '../settings';

export const SUPPORT_SESSION_MINUTES = 60;

export type OpenSupportSession = { id: string; platformUserId: string; agencyId: string; agencyName: string; reason: string; expiresAt: Date };
export type EndReason = 'exit' | 'expired' | 'replaced' | 'revoked';

/** Ends this user's open session as 'replaced' (same tx), then opens a new one for 60 minutes. Role checks live in the tool. */
export async function startSession(
  service: Db,
  a: { platformUserId: string; agencyId: string; reason: string; now?: Date },
): Promise<OpenSupportSession> {
  const now = a.now ?? new Date();
  const expiresAt = new Date(now.getTime() + SUPPORT_SESSION_MINUTES * 60_000);
  const reason = a.reason.trim();
  // Two concurrent starts both see no open row, and the loser's insert hits `support_session_open_uq`. One retry ends
  // the session that just won (as 'replaced') and opens this one; a second collision is a conflict.
  try {
    return await openTx(service, a, reason, now, expiresAt);
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
  }
  try {
    return await openTx(service, a, reason, now, expiresAt);
  } catch (err) {
    if (isUniqueViolation(err)) throw new ToolError('conflict', 'Another support session was started at the same time. Try again.', { cause: err });
    throw err;
  }
}

function openTx(
  service: Db,
  a: { platformUserId: string; agencyId: string },
  reason: string,
  now: Date,
  expiresAt: Date,
): Promise<OpenSupportSession> {
  return service.transaction(async (tx) => {
    const [ag] = await tx.select({ name: agency.name }).from(agency).where(eq(agency.id, a.agencyId));
    if (!ag) throw new ToolError('not_found', 'Agency not found');
    await tx
      .update(supportSession)
      .set({ endedAt: now, endReason: 'replaced' })
      .where(and(eq(supportSession.platformUserId, a.platformUserId), isNull(supportSession.endedAt)));
    const [row] = await tx
      .insert(supportSession)
      .values({ platformUserId: a.platformUserId, agencyId: a.agencyId, reason, startedAt: now, expiresAt })
      .returning({ id: supportSession.id });
    return { id: row!.id, platformUserId: a.platformUserId, agencyId: a.agencyId, agencyName: ag.name, reason, expiresAt };
  });
}

/** Idempotent: only an open session is touched, so the first end reason stays. */
export async function endSession(service: Db, id: string, reason: EndReason, now: Date = new Date()): Promise<void> {
  await service
    .update(supportSession)
    .set({ endedAt: now, endReason: reason })
    .where(and(eq(supportSession.id, id), isNull(supportSession.endedAt)));
}

export type ResolveResult =
  | { kind: 'ok'; session: OpenSupportSession }
  | { kind: 'expired'; agencyId: string }
  | { kind: 'revoked' }
  | { kind: 'invalid' };

/**
 * Spec "Session resolution". Expired and revoked sessions are ended here unless `endStale: false` — the web render
 * path passes false so the row stays open until `/support/end` ends it and picks the right redirect.
 */
export async function resolveSession(
  deps: Pick<ToolDeps, 'service' | 'platformAdmins'>,
  a: { sessionId: string; userId: string; now?: Date; endStale?: boolean },
): Promise<ResolveResult> {
  const endStale = a.endStale ?? true;
  if (!isUuid(a.sessionId)) return { kind: 'invalid' };
  const now = a.now ?? new Date();
  const [row] = await deps.service
    .select({
      id: supportSession.id, platformUserId: supportSession.platformUserId, agencyId: supportSession.agencyId, reason: supportSession.reason,
      expiresAt: supportSession.expiresAt, endedAt: supportSession.endedAt, agencyName: agency.name,
    })
    .from(supportSession)
    .innerJoin(agency, eq(agency.id, supportSession.agencyId))
    .where(eq(supportSession.id, a.sessionId));
  if (!row || row.endedAt !== null || row.platformUserId !== a.userId) return { kind: 'invalid' };
  if (row.expiresAt.getTime() <= now.getTime()) {
    if (endStale) await endSession(deps.service, row.id, 'expired', now);
    return { kind: 'expired', agencyId: row.agencyId };
  }
  const role = await platformRoleForUser(deps, a.userId);
  if (role !== 'owner' && role !== 'staff') {
    if (endStale) await endSession(deps.service, row.id, 'revoked', now);
    return { kind: 'revoked' };
  }
  return { kind: 'ok', session: { id: row.id, platformUserId: row.platformUserId, agencyId: row.agencyId, agencyName: row.agencyName, reason: row.reason, expiresAt: row.expiresAt } };
}
