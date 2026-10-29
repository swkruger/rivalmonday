import { ensureExemptPilot } from '@cs/billing';
import { ToolError } from '@cs/core';
import { agency, type Db, membership, platformSetting, type Tx } from '@cs/db';
import { addContact, ensureAgencyRunbook } from '@cs/engine';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { catalogOf } from '../catalog/access';
import type { ToolDeps } from '../deps';
import { SAMPLE_AGENCY_KEY, sampleAgencyId } from './settings';

/**
 * Phase 17a: the sample space. Sample briefs are built for businesses in one platform-owned agency, created on the first
 * approval. It is an exempt pilot with no onboarding row, never emails a client and stays out of the spike guard.
 */
export const SAMPLE_AGENCY_NAME = 'Rival Monday Samples';
export const SAMPLE_NO_CONTACTS = 'Sample businesses have no owner or recipients. Skip this step.';

/**
 * The sample agency's id, created once inside the caller's transaction. Concurrent first calls serialise on the setting row:
 * the row is claimed first (with a fresh id) and only the claimant creates the agency; a loser waits on the primary key,
 * then reads the winner's id. Either way the row stays locked until the caller commits.
 */
export async function ensureSampleAgency(tx: Tx, deps: ToolDeps, actorId: string): Promise<string> {
  const read = async () => {
    const [s] = await tx.select({ value: platformSetting.value }).from(platformSetting).where(eq(platformSetting.key, SAMPLE_AGENCY_KEY)).for('update');
    const id = (s?.value as { agencyId?: unknown } | undefined)?.agencyId;
    return typeof id === 'string' ? id : null;
  };
  const existing = await read();
  if (existing) return existing;
  const id = randomUUID();
  const claimed = await tx.insert(platformSetting).values({ key: SAMPLE_AGENCY_KEY, value: { agencyId: id }, updatedBy: actorId })
    .onConflictDoNothing({ target: platformSetting.key }).returning({ key: platformSetting.key });
  if (claimed.length === 0) {
    const won = await read();
    if (!won) throw new ToolError('internal', 'The sample agency setting is unreadable');
    return won;
  }
  await tx.insert(agency).values({ id, name: SAMPLE_AGENCY_NAME, branding: null });
  // Same as a sign-up (completePendingSignups), minus the profile, onboarding row and trial: a platform-owned pilot.
  await ensureAgencyRunbook(tx, id, await catalogOf(deps).generic());
  await ensureExemptPilot(tx, id);
  return id;
}

/** Gives the operator an `agency_admin` membership (with its notification contact) in the sample agency, once. */
export async function ensureOperatorMembership(tx: Tx, agencyId: string, userId: string): Promise<void> {
  const [has] = await tx.select({ id: membership.id }).from(membership)
    .where(and(eq(membership.userId, userId), eq(membership.agencyId, agencyId), isNull(membership.clientId)));
  if (has) return;
  const [u] = [...(await tx.execute<{ email: string; name: string | null }>(sql`select email, name from auth."user" where id = ${userId}`))];
  if (!u) throw new ToolError('internal', 'Operator account not found');
  const contactId = await addContact(tx, { agencyId, clientId: null, role: 'agency_admin', email: u.email, name: u.name || null, clientScope: null, userId });
  await tx.insert(membership).values({ userId, agencyId, role: 'agency_admin', clientId: null, clientScope: null, contactId, createdBy: userId });
}

export async function isSampleAgency(db: Db, agencyId: string): Promise<boolean> {
  return (await sampleAgencyId(db)) === agencyId;
}

/** Contact-creating tools call this first: the sample agency never invites or emails a business. */
export async function refuseSampleContacts(deps: ToolDeps, agencyId: string): Promise<void> {
  if (await isSampleAgency(deps.service, agencyId)) throw new ToolError('invalid_input', SAMPLE_NO_CONTACTS, { userFacing: true });
}
