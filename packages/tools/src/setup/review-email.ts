import { client, clientSetup, competitorSuggestion, contact, invitation } from '@cs/db';
import { type Conn, type DeliveryConfig, loadBranding, notify, replyToFor } from '@cs/engine';
import { and, desc, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import { latestDoneRun } from '../rival-search';
import { getSetupState } from './state';

const MAX_NAMES = 5;

/**
 * Phase 11b Task 20 (spec E3/§5): emails the invited owner the competitors to review, Cc the inviter (else the account
 * manager). Shared by the daily `setup-reminders` and `invite_client_owner` (dedupe `competitor-review:<clientId>`, only
 * while competitors are `waiting_owner`) and the manual `send_competitor_review`
 * (dedupe adds the UTC day, ignores the competitors step). Returns false when a condition fails or the dedupe key
 * already exists. Props carry names only, never suggestion internals.
 */
export async function queueCompetitorReview(
  conn: Conn,
  cfg: DeliveryConfig,
  input: { agencyId: string; clientId: string; dedupe: string; now: Date; manual?: boolean },
): Promise<boolean> {
  const { agencyId, clientId, now } = input;
  const [row] = await conn
    .select({ c: client, setup: clientSetup })
    .from(clientSetup)
    .innerJoin(client, eq(client.id, clientSetup.clientId))
    .where(and(eq(clientSetup.clientId, clientId), eq(client.agencyId, agencyId), isNotNull(clientSetup.invitedContactId)));
  const invitedContactId = row?.setup.invitedContactId;
  if (!row || !invitedContactId) return false;
  const { c, setup } = row;

  const [owner] = await conn
    .select({ id: contact.id, email: contact.email, active: contact.active })
    .from(contact)
    .where(and(eq(contact.id, invitedContactId), eq(contact.agencyId, agencyId), eq(contact.clientId, clientId)));
  if (!owner?.email) return false;
  const [inv] = await conn
    .select({ acceptedAt: invitation.acceptedAt, expiresAt: invitation.expiresAt })
    .from(invitation)
    .where(and(eq(invitation.agencyId, agencyId), eq(invitation.clientId, clientId), eq(invitation.role, 'client_owner'), sql`lower(${invitation.email}) = lower(${owner.email})`, sql`${invitation.revokedAt} IS NULL`))
    .orderBy(desc(invitation.createdAt))
    .limit(1);
  if (!inv) return false;
  // Pending and unexpired, or accepted by a contact who is still active (INACTIVE_OK_KINDS would otherwise reach a deactivated one).
  const pending = !inv.acceptedAt && inv.expiresAt.getTime() > now.getTime();
  const accepted = !!inv.acceptedAt && owner.active;
  if (!pending && !accepted) return false;

  const state = await getSetupState(conn, clientId, now);
  // Automatic: only while the agency asked the owner to pick and they haven't (`waiting_owner`, O12/P12): otherwise the
  // owner can't pick at all (P8). Manual (staff) ignores the step.
  if (!input.manual && state.competitors !== 'waiting_owner') return false;

  const run = await latestDoneRun(conn, clientId);
  if (!run) return false;
  const rows = await conn
    .select({ name: competitorSuggestion.name })
    .from(competitorSuggestion)
    .where(and(eq(competitorSuggestion.clientId, clientId), eq(competitorSuggestion.runId, run.id), inArray(competitorSuggestion.status, ['suggested', 'accepted']), inArray(competitorSuggestion.tier, ['top', 'watch'])))
    .orderBy(sql`(${competitorSuggestion.tier} = 'top') DESC`, desc(competitorSuggestion.overlapScore))
    .limit(MAX_NAMES);
  const competitorNames = rows.map((r) => r.name);
  if (competitorNames.length === 0) return false;

  let ccEmail: string | undefined;
  if (setup.invitedBy) {
    const u = await conn.execute<{ email: string }>(sql`select email from auth."user" where id = ${setup.invitedBy}`);
    ccEmail = [...u][0]?.email;
  }
  ccEmail ??= (await replyToFor(conn, agencyId, clientId))?.email;

  const branding = await loadBranding(conn, agencyId);
  // Owners never enter /setup (P8): the overview carries the "choose competitors" card while they are asked to pick.
  const next = `/c/${clientId}`;
  // Built from the validated client id only; the sign-in page re-checks `next` with `safeNext`.
  const reviewUrl = `${cfg.appUrl}/sign-in?email=${encodeURIComponent(owner.email.toLowerCase())}&next=${encodeURIComponent(next)}`;
  const props = { branding, businessName: c.name, competitorNames, reviewUrl };
  const queued = await notify(conn, cfg, {
    agencyId, clientId, kind: 'competitor_review', audience: 'client', subjectType: 'setup', subjectId: clientId,
    dedupe: input.dedupe, link: { t: 'setup', id: clientId }, now, contactIds: [owner.id], cc: ccEmail ? [ccEmail] : [],
    build: () => ({
      title: `${c.name}: competitors to review`,
      body: `${branding.displayName} found competitors for ${c.name}: ${competitorNames.join(', ')}.`,
      email: { template: 'competitor_review', props },
    }),
  });
  return queued > 0;
}
