import { createHash } from 'node:crypto';
import { ensureExemptPilot } from '@cs/billing';
import { fixturePlaceId, SOURCE_KINDS } from '@cs/collectors';
import { agency, brief, catalogRows, client, clientCompetitor, clientSetup, competitor, competitorSource, contact, type Db, membership, trackedPage } from '@cs/db';
import { DELIVERY_LOCAL_HOUR, deliveryDateFor, ensureAgencyRunbook, QUIET_SUMMARY } from '@cs/engine';
import { acceptInvitations, createInvitation } from '@cs/tools';
import { createCatalog } from '@cs/verticals';
import { and, eq, isNull, like, sql } from 'drizzle-orm';
import { addDays, localDate, REHEARSAL_TIMEZONE, type RehearsalManifest, windowOpenFor, zonedTime } from './manifest';

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
/** Decision 2: the weekly clients have been live for five weeks (a sent starting point and four sent weekly briefs). */
export const REHEARSAL_ACTIVATED_DAYS_AGO = 35;
export const REHEARSAL_PAST_WEEKLY_BRIEFS = 4;
export const REHEARSAL_COMPETITORS_PER_CLIENT = 3;
export const FIXTURE_HOST_COUNT = 5;
/** `/` = home, then the three fixture sub-pages (`packages/collectors/src/rehearsal/fixture-sites.ts`). */
const FIXTURE_PAGES = [['', 'home'], ['pricing', 'pricing'], ['services', 'service'], ['offers', 'promo']] as const;
const SEED_ACTOR = 'rehearsal-seed';
const SERVICE_AREA = { center: { lat: 32.7767, lng: -96.797 }, radiusKm: 25, zips: ['75201', '75204'], towns: ['Dallas'] };

export interface RehearsalSeedOptions {
  agencies: number;
  /** Weekly clients per agency. */
  clients: number;
  /** New clients whose starting-point clock starts now (in extra agencies after the weekly ones, `clients` per agency). */
  startingPoints: number;
  /** Weekly clients on the live AI slice (`REHEARSAL_LIVE_CLIENT_IDS`). */
  liveClients: number;
  /** `<host>/<db>` written into the manifest. */
  database: string;
  now?: Date;
  random?: () => number;
  log?: (line: string) => void;
}

export const fixtureHost = (n: number): string => `fx${n}.rehearsal.rivalmonday.app`;
/** Client group `g` (1-based client number) site `s` (1–3): spread over the five fixture hosts. */
export const fixtureSiteBase = (g: number, s: number): string => `https://${fixtureHost((((g - 1) * REHEARSAL_COMPETITORS_PER_CLIENT + (s - 1)) % FIXTURE_HOST_COUNT) + 1)}/g${g}/s${s}`;
/** Same name the fixture site renders, so GBP/review fixtures (looked up by `fixturePlaceId`) carry it too. */
export const fixtureSiteName = (g: number, s: number): string => `Group ${g} Site ${s} Home Services`;
/** A pinned Google Ads advertiser id: domain-mode fixture ads are titled with the domain and filtered out, pinned ones are kept. */
const advertiserIdFor = (name: string): string => `AR${BigInt(`0x${createHash('sha256').update(`rehearsal:${name}`).digest('hex').slice(0, 16)}`).toString().padStart(20, '0').slice(-20)}`;
const pad2 = (n: number) => String(n).padStart(2, '0');
const pad3 = (n: number) => String(n).padStart(3, '0');

function validate(o: RehearsalSeedOptions): void {
  const int = (v: number, lo: number, hi: number, name: string) => {
    if (!Number.isInteger(v) || v < lo || v > hi) throw new Error(`--${name} must be a whole number from ${lo} to ${hi}`);
  };
  int(o.agencies, 1, 90, 'agencies');
  int(o.clients, 1, 10, 'clients');
  int(o.startingPoints, 0, 270, 'starting-points');
  int(o.liveClients, 0, o.agencies * o.clients, 'live-clients');
}

/**
 * 7c2 Task 10b (decisions 1–3, 11): the staging rehearsal's tenants. Weekly agencies `Rehearsal Agency 01…N` with
 * `clients` active Chicago clients each, live for five weeks (sent starting point + four sent quiet weekly briefs, so the
 * period and baseline logic see history), three fixture-host competitors per client with daily pages, vendor sources
 * marked current; then extra agencies holding the new starting-point clients (clock = now). Only rows the app itself
 * writes; no evidence, captures or observations (the worker collects from the fixture vendors and hosts).
 */
export async function seedRehearsal(db: Db, o: RehearsalSeedOptions): Promise<RehearsalManifest> {
  validate(o);
  const now = o.now ?? new Date();
  const random = o.random ?? Math.random;
  const log = o.log ?? (() => {});
  const live = await db.select({ name: agency.name }).from(agency).where(and(like(agency.name, 'Rehearsal Agency %'), isNull(agency.archivedAt))).limit(1);
  if (live.length > 0) throw new Error('Refusing: this database is already seeded (rehearsal agencies exist); run `rehearsal teardown` and archive them first');

  const generic = await createCatalog(() => catalogRows(db), { ttlMs: 60_000 }).generic();
  const deliveryDate = deliveryDateFor(now, REHEARSAL_TIMEZONE);
  const activatedAt = new Date(now.getTime() - REHEARSAL_ACTIVATED_DAYS_AGO * DAY_MS);
  const manifest: RehearsalManifest = {
    version: 1, seededAt: now.toISOString(), database: o.database, timezone: REHEARSAL_TIMEZONE, deliveryDate,
    agencies: [], weeklyClientIds: [], startingPointClientIds: [], liveClientIds: [],
  };
  const spAgencies = Math.ceil(o.startingPoints / o.clients);
  let group = 0; // global client number = fixture group
  let sourceNo = 0;
  const totalSources = (o.agencies * o.clients + o.startingPoints) * REHEARSAL_COMPETITORS_PER_CLIENT * SOURCE_KINDS.length;

  for (let a = 1; a <= o.agencies + spAgencies; a++) {
    const startingPoint = a > o.agencies;
    const count = startingPoint ? Math.min(o.clients, o.startingPoints - (a - o.agencies - 1) * o.clients) : o.clients;
    const name = `Rehearsal Agency ${pad2(a)}`;
    const [ag] = await db.insert(agency).values({
      name, branding: { displayName: name, primary: '#2A6BAC', secondary: '#47A8E7', fromName: name, signOff: `The ${name} team` }, createdAt: startingPoint ? now : activatedAt,
    }).returning({ id: agency.id });
    const agencyId = ag!.id;
    await ensureExemptPilot(db, agencyId);
    await ensureAgencyRunbook(db, agencyId, generic);

    for (let i = 0; i < count; i++) {
      group++;
      const clientName = `Rehearsal Client ${pad3(group)}`;
      const clientActivatedAt = startingPoint ? now : activatedAt;
      const [c] = await db.insert(client).values({
        agencyId, name: clientName, verticalId: 'hvac_plumbing', status: 'active', timezone: REHEARSAL_TIMEZONE, features: ['dashboard'],
        services: ['ac_repair', 'furnace_repair', 'drain_cleaning', 'water_heater'],
        // Starting-point clients have no keywords, so their readiness waits on the self profile and reviews only (no discovery run).
        keywords: startingPoint ? [] : ['ac repair', 'plumber'], serviceArea: SERVICE_AREA, placeId: fixturePlaceId(clientName),
        briefAutoSend: !startingPoint && manifest.weeklyClientIds.length % 2 === 0, activatedAt: clientActivatedAt, createdAt: clientActivatedAt,
      }).returning({ id: client.id });
      const clientId = c!.id;
      (startingPoint ? manifest.startingPointClientIds : manifest.weeklyClientIds).push(clientId);
      await db.insert(contact).values({ agencyId, clientId, role: 'client_owner', name: `Owner ${pad3(group)}`, email: `rehearsal-client-${pad3(group)}@example.com` });

      for (let s = 1; s <= REHEARSAL_COMPETITORS_PER_CLIENT; s++) {
        const rivalName = fixtureSiteName(group, s);
        const [r] = await db.insert(competitor).values({ name: rivalName, placeId: fixturePlaceId(rivalName), googleAdvertiserIds: [advertiserIdFor(rivalName)], createdAt: clientActivatedAt }).returning({ id: competitor.id });
        const competitorId = r!.id;
        await db.insert(clientCompetitor).values({ agencyId, clientId, competitorId, createdAt: clientActivatedAt });
        const base = fixtureSiteBase(group, s);
        // First captures spread over the next 12 hours (Mon/Tue serve the baseline, decision 11); daily after that.
        await db.insert(trackedPage).values(FIXTURE_PAGES.map(([path, pageType], k) => ({
          competitorId, url: `${base}/${path}`, pageType, source: 'manual', cadence: 'daily', active: true,
          nextDueAt: new Date(now.getTime() + ((((group - 1) * REHEARSAL_COMPETITORS_PER_CLIENT + s - 1) * FIXTURE_PAGES.length + k) % 144) * 5 * 60_000),
          createdAt: clientActivatedAt,
        })));
        // "Current": last run a week before its next run, the next runs spread over the coming week.
        await db.insert(competitorSource).values(SOURCE_KINDS.map((source) => {
          sourceNo++;
          const next = new Date(now.getTime() + Math.round((sourceNo / (totalSources + 1)) * 7 * DAY_MS));
          return { competitorId, source, active: true, nextDueAt: next, lastRunAt: new Date(next.getTime() - 7 * DAY_MS), lastStatus: 'ok' };
        }));
      }

      if (startingPoint) {
        // The starting-point clock (11a): competitors done now; the wizard is finished.
        await db.insert(clientSetup).values({ clientId, agencyId, source: 'staff', competitorsDoneAt: now, completedAt: now, lastChangedAt: now });
      } else {
        await seedPastBriefs(db, { agencyId, clientId, activatedAt, deliveryDate });
      }
    }

    manifest.agencies.push({ id: agencyId, name, adminUserId: await seedStaff(db, agencyId, a, startingPoint ? now : activatedAt) });
    log(`seeded ${name} (${count} ${startingPoint ? 'starting-point' : 'weekly'} clients)`);
  }

  manifest.liveClientIds = sample(manifest.weeklyClientIds, o.liveClients, random);
  return manifest;
}

/** A sent starting point two days after activation, then the last four Mondays' sent quiet briefs (no items, so no evidence). */
export async function seedPastBriefs(db: Db, c: { agencyId: string; clientId: string; activatedAt: Date; deliveryDate: string }): Promise<void> {
  const spAt = new Date(c.activatedAt.getTime() + 48 * HOUR_MS);
  const rows: (typeof brief.$inferInsert)[] = [{
    agencyId: c.agencyId, clientId: c.clientId, kind: 'starting_point', status: 'sent', deliveryDate: localDate(spAt, REHEARSAL_TIMEZONE),
    periodStart: c.activatedAt, periodEnd: spAt, summary: 'Where you stand today.', generatedAt: spAt, approvedAt: spAt, approvedBy: SEED_ACTOR, sentAt: new Date(spAt.getTime() + HOUR_MS),
  }];
  for (let k = 1; k <= REHEARSAL_PAST_WEEKLY_BRIEFS; k++) {
    const monday = addDays(c.deliveryDate, -7 * k);
    const open = windowOpenFor(monday, REHEARSAL_TIMEZONE);
    rows.push({
      agencyId: c.agencyId, clientId: c.clientId, kind: 'quiet', status: 'sent', deliveryDate: monday, periodStart: new Date(open.getTime() - 7 * DAY_MS), periodEnd: open,
      summary: QUIET_SUMMARY, generatedAt: new Date(open.getTime() + 10 * 60_000), sentAt: zonedTime(monday, DELIVERY_LOCAL_HOUR, 0, REHEARSAL_TIMEZONE),
    });
  }
  await db.insert(brief).values(rows);
}

/** Agency admin + account manager, made the way the app makes them (invitation, then acceptance). Returns the admin's user id. */
async function seedStaff(db: Db, agencyId: string, a: number, at: Date): Promise<string> {
  let adminUserId = '';
  for (const role of ['agency_admin', 'account_manager'] as const) {
    const key = role === 'agency_admin' ? 'admin' : 'am';
    const userId = `rehearsal-${pad2(a)}-${key}`;
    const email = `rehearsal-agency-${pad2(a)}-${key}@example.com`;
    const name = `Rehearsal ${pad2(a)} ${role === 'agency_admin' ? 'Admin' : 'Account Manager'}`;
    await db.execute(sql`insert into auth."user" (id, name, email, "emailVerified") values (${userId}, ${name}, ${email}, true)`);
    await createInvitation(db, { agencyId, email, role, clientId: null, invitedBy: SEED_ACTOR }, at);
    await acceptInvitations(db, { id: userId, email, name }, at);
    const [m] = await db.select({ contactId: membership.contactId }).from(membership).where(and(eq(membership.userId, userId), eq(membership.agencyId, agencyId)));
    if (!m?.contactId) throw new Error(`rehearsal user ${userId} has no contact after accepting its invitation`);
    if (role === 'agency_admin') adminUserId = userId;
  }
  return adminUserId;
}

function sample<T>(items: readonly T[], n: number, random: () => number): T[] {
  const pool = [...items];
  for (let i = 0; i < Math.min(n, pool.length); i++) {
    const j = i + Math.floor(random() * (pool.length - i));
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  return pool.slice(0, Math.min(n, pool.length));
}
