import { ensureExemptPilot } from '@cs/billing';
import { createAccessContext, isUuid, ToolError } from '@cs/core';
import { agency, brief, briefItem, capture, client, competitor, contact, type Db, evidence, membership, platformSetting, type Tx, waitlistEntry } from '@cs/db';
import { addContact, ensureAgencyRunbook } from '@cs/engine';
import { and, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { catalogOf } from '../catalog/access';
import type { ToolDeps } from '../deps';
import { briefDetail } from '../tools/briefs';
import type { BriefDetail, EvidenceRef } from '../tools/schemas';
import { evidenceContentType } from '../workspace/evidence-access';
import { channelLabel } from '../workspace/labels';
import { verifySampleToken } from './sample-token';
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
  // A stale agency-level contact (its membership was removed) is reused, so contact_email_unique never blocks an approval.
  const [stale] = await tx.select({ id: contact.id }).from(contact)
    .where(and(eq(contact.agencyId, agencyId), isNull(contact.clientId), sql`lower(${contact.email}) = lower(${u.email})`)).limit(1);
  if (stale) await tx.update(contact).set({ active: true, userId, role: 'agency_admin' }).where(eq(contact.id, stale.id));
  const contactId = stale?.id
    ?? await addContact(tx, { agencyId, clientId: null, role: 'agency_admin', email: u.email, name: u.name || null, clientScope: null, userId });
  await tx.insert(membership).values({ userId, agencyId, role: 'agency_admin', clientId: null, clientScope: null, contactId, createdBy: userId });
}

export async function isSampleAgency(db: Db | Tx, agencyId: string): Promise<boolean> {
  return (await sampleAgencyId(db)) === agencyId;
}

/**
 * The sample agency never invites or emails a business: contact tools call this first, and the client-invite choke points
 * (`inviteClientUser`, `sendClientInvite`) call it too, so every path (accept_lead, resends) is covered.
 */
export async function refuseSampleContacts(db: Db | Tx, agencyId: string): Promise<void> {
  if (await isSampleAgency(db, agencyId)) throw new ToolError('invalid_input', SAMPLE_NO_CONTACTS, { userFacing: true });
}

// ---- the public sample link (Task 11). Service-role reads behind a verified token; every miss is `null` (a 404). ----

/** The sent sample a link names: its entry (still `sent`), that entry's live client and the client's approved/sent starting point. */
async function sampleTarget(service: Db, token: string, secret: string, now: Date) {
  const v = verifySampleToken(token, secret, now);
  if (!v) return null;
  const [e] = await service.select({ clientId: waitlistEntry.sampleClientId }).from(waitlistEntry)
    .where(and(eq(waitlistEntry.id, v.entryId), eq(waitlistEntry.kind, 'agency'), eq(waitlistEntry.sampleStatus, 'sent'), isNotNull(waitlistEntry.sampleClientId)));
  if (!e?.clientId) return null;
  const [row] = await service
    .select({ briefId: brief.id, agencyId: client.agencyId, clientId: client.id, name: client.name, timezone: client.timezone })
    .from(brief).innerJoin(client, eq(client.id, brief.clientId))
    .where(and(eq(brief.clientId, e.clientId), eq(brief.kind, 'starting_point'), inArray(brief.status, ['approved', 'sent']), isNull(client.archivedAt)));
  return row ? { ...row, expMs: v.expMs } : null;
}

/**
 * The sample starting point as its client would read it, for `/sample/<token>`. The reader context is a `client_viewer`
 * of this one client (active items only, `upsellTag` null); it is built here and never leaves this function.
 */
export async function getSampleBrief(deps: Pick<ToolDeps, 'service' | 'app'>, token: string, secret: string, now: Date)
  : Promise<{ brief: BriefDetail; businessName: string; timezone: string; expiresAt: string; refs: EvidenceRef[] } | null> {
  const t = await sampleTarget(deps.service, token, secret, now);
  if (!t) return null;
  const readerCtx = createAccessContext({ agencyId: t.agencyId, userId: 'sample-link', role: 'client_viewer', clientScope: [t.clientId], features: [] });
  let detail: BriefDetail;
  try {
    detail = await briefDetail({ app: deps.app } as ToolDeps, readerCtx, t.briefId);
  } catch (err) {
    if (err instanceof ToolError) return null;
    throw err;
  }
  const ids = [...new Set(detail.items.flatMap((i) => i.evidenceIds))].filter(isUuid);
  const rows = ids.length
    ? await deps.service
      .select({ id: evidence.id, source: capture.source, capturedAt: capture.capturedAt, competitorName: competitor.name })
      .from(evidence).innerJoin(capture, eq(capture.id, evidence.captureId)).innerJoin(competitor, eq(competitor.id, capture.competitorId))
      .where(inArray(evidence.id, ids))
    : [];
  const byId = new Map(rows.map((r) => [r.id, r]));
  const refs = ids.flatMap((id) => {
    const r = byId.get(id);
    return r ? [{ evidenceId: id, competitorName: r.competitorName, channelLabel: channelLabel(r.source), capturedAt: r.capturedAt.toISOString() }] : [];
  });
  return { brief: detail, businessName: t.name, timezone: t.timezone, expiresAt: new Date(t.expMs).toISOString(), refs };
}

/** The stored file behind one evidence chip of the sample: cited by an active item, and a servable kind only (never html/vendor_json). */
export async function sampleEvidenceKey(service: Db, token: string, secret: string, evidenceId: string, now: Date)
  : Promise<{ objectKey: string; kind: 'screenshot' | 'text' } | null> {
  if (!isUuid(evidenceId)) return null;
  const t = await sampleTarget(service, token, secret, now);
  if (!t) return null;
  const items = await service.select({ evidenceIds: briefItem.evidenceIds }).from(briefItem)
    .where(and(eq(briefItem.briefId, t.briefId), eq(briefItem.status, 'active')));
  if (!items.some((i) => i.evidenceIds.includes(evidenceId))) return null;
  const [ev] = await service.select({ objectKey: evidence.objectKey, kind: evidence.kind }).from(evidence).where(eq(evidence.id, evidenceId));
  if (!ev || !evidenceContentType(ev.kind)) return null;
  return { objectKey: ev.objectKey, kind: ev.kind as 'screenshot' | 'text' };
}
