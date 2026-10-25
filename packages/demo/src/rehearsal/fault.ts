import { ensureExemptPilot } from '@cs/billing';
import { agency, brief, client, type Db } from '@cs/db';
import { BRIEF_MAX_ATTEMPTS, deliveryDateFor } from '@cs/engine';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { FAULT_AGENCY_NAME, REHEARSAL_TIMEZONE, type RehearsalManifest, windowOpenFor } from './manifest';
import { REHEARSAL_ACTIVATED_DAYS_AGO, seedPastBriefs } from './seed';

const DAY_MS = 86_400_000;
export const FAULT_ERROR = 'Rehearsal fault injection: pre-failed at max attempts';

/**
 * Plan decision 12: a 41st agency whose clients' briefs for the coming Monday are already `failed` at `BRIEF_MAX_ATTEMPTS`,
 * so generation never claims them and the Friday 12:00 `generation_closed` alarm must fire (and email) for exactly them.
 * Runs before the window opens (Thursday 22:00 local); the clients look like the weekly ones (live five weeks, sent history).
 */
export async function seedFault(
  db: Db,
  o: { clients: number; manifest: Pick<RehearsalManifest, 'deliveryDate'>; now?: Date },
): Promise<{ agencyId: string; clientIds: string[]; deliveryDate: string }> {
  if (!Number.isInteger(o.clients) || o.clients < 1 || o.clients > 10) throw new Error('--clients must be a whole number from 1 to 10');
  const now = o.now ?? new Date();
  const deliveryDate = deliveryDateFor(now, REHEARSAL_TIMEZONE);
  const open = windowOpenFor(deliveryDate, REHEARSAL_TIMEZONE);
  if (now.getTime() >= open.getTime()) {
    throw new Error(`Refusing: run \`rehearsal fault\` before Thursday 22:00 local (the window for ${deliveryDate} opened at ${open.toISOString()})`);
  }
  if (deliveryDate !== o.manifest.deliveryDate) {
    throw new Error(`Refusing: the coming Monday is ${deliveryDate} but the rehearsal manifest is for ${o.manifest.deliveryDate} (run fault in the seeded week)`);
  }
  const weekly = await db.select({ id: agency.id }).from(agency).where(and(sql`${agency.name} ~ '^Rehearsal Agency [0-9]{2}$'`, isNull(agency.archivedAt))).limit(1);
  if (weekly.length === 0) throw new Error('Refusing: no live rehearsal agencies in this database (run `rehearsal seed` first)');
  const existing = await db.select({ id: agency.id }).from(agency).where(and(eq(agency.name, FAULT_AGENCY_NAME), isNull(agency.archivedAt))).limit(1);
  if (existing.length > 0) throw new Error(`Refusing: "${FAULT_AGENCY_NAME}" already exists (${existing[0]!.id})`);
  return db.transaction((tx) => insertFault(tx as unknown as Db, o.clients, now, deliveryDate, open));
}

async function insertFault(db: Db, clients: number, now: Date, deliveryDate: string, open: Date): Promise<{ agencyId: string; clientIds: string[]; deliveryDate: string }> {

  const activatedAt = new Date(now.getTime() - REHEARSAL_ACTIVATED_DAYS_AGO * DAY_MS);
  const [a] = await db.insert(agency).values({ name: FAULT_AGENCY_NAME, createdAt: activatedAt }).returning({ id: agency.id });
  const agencyId = a!.id;
  await ensureExemptPilot(db, agencyId);
  const clientIds: string[] = [];
  for (let i = 1; i <= clients; i++) {
    const [c] = await db.insert(client).values({
      agencyId, name: `Rehearsal Fault Client ${i}`, verticalId: 'hvac_plumbing', status: 'active', timezone: REHEARSAL_TIMEZONE, features: ['dashboard'],
      activatedAt, createdAt: activatedAt,
    }).returning({ id: client.id });
    const clientId = c!.id;
    clientIds.push(clientId);
    await seedPastBriefs(db, { agencyId, clientId, activatedAt, deliveryDate });
    await db.insert(brief).values({
      agencyId, clientId, deliveryDate, kind: 'standard', status: 'failed', attempts: BRIEF_MAX_ATTEMPTS, error: FAULT_ERROR,
      periodStart: new Date(open.getTime() - 7 * DAY_MS), periodEnd: open,
    });
  }
  return { agencyId, clientIds, deliveryDate };
}
