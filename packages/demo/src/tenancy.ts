import { agency, client, clientCompetitor, competitor, competitorSource, membership, type ServiceArea, trackedPage } from '@cs/db';
import { acceptInvitations, createInvitation } from '@cs/tools';
import { eq, sql } from 'drizzle-orm';
import type { SeedContext } from './context';
import type { ActiveClientKey, DemoClientKey, DemoCompetitor } from './ids';
import { DEMO_USERS } from './users';

export const DEMO_COLLECTOR = 'demo-seed';
export const LONE_STAR_PLACE_ID = 'demo-place-lone-star-cooling';
const GRANBURY = { lat: 32.4421, lng: -97.7942 };

/** Lone Star's custom alert rules (spec §4.7); Brazos keeps the pack defaults. */
export const CLIENT_THRESHOLDS: Record<ActiveClientKey, { alert: number; brief: number }> = { loneStar: { alert: 65, brief: 35 }, brazos: { alert: 70, brief: 40 } };

interface ClientSpec {
  name: string;
  verticalId: string;
  status: 'active' | 'prospect';
  features: string[];
  services: string[];
  keywords: string[];
  serviceArea: ServiceArea & { radiusKm: number };
  competitorLimit: number;
  competitors: { name: string; slug: string; lat: number; lng: number }[];
}

export const CLIENT_SPECS: Record<DemoClientKey, ClientSpec> = {
  loneStar: {
    name: 'Lone Star Cooling', verticalId: 'hvac_plumbing', status: 'active', features: ['dashboard', 'alert_rules', 'manage_competitors'],
    services: ['ac_tune_up', 'ac_repair', 'ac_install', 'furnace_tune_up', 'furnace_repair', 'duct_cleaning', 'maintenance_plan'],
    keywords: ['ac repair granbury', 'hvac contractor', 'furnace repair'],
    serviceArea: { center: GRANBURY, radiusKm: 25, zips: ['76048', '76049', '76050'], towns: ['Granbury', 'Acton', 'Tolar', 'Lipan'] },
    competitorLimit: 8, // deviation 11
    competitors: [
      { name: 'Hill Country Air & Heat', slug: 'hill-country-air', lat: 32.457, lng: -97.771 },
      { name: 'Granbury Comfort Pros', slug: 'granbury-comfort-pros', lat: 32.431, lng: -97.8105 },
      { name: 'Brazos Valley HVAC', slug: 'brazos-valley-hvac', lat: 32.3925, lng: -97.735 },
      { name: 'Lake Granbury Heating & Air', slug: 'lake-granbury-heating', lat: 32.4705, lng: -97.832 },
      { name: 'Pecan Plantation Mechanical', slug: 'pecan-plantation-mechanical', lat: 32.354, lng: -97.676 },
      { name: 'Acton Climate Control', slug: 'acton-climate-control', lat: 32.433, lng: -97.687 },
    ],
  },
  brazos: {
    name: 'Brazos Plumbing Co', verticalId: 'hvac_plumbing', status: 'active', features: ['dashboard'],
    services: ['drain_cleaning', 'water_heater', 'leak_repair', 'sewer_line', 'emergency_service'],
    keywords: ['plumber granbury', 'drain cleaning', 'water heater repair'], // deviation 12
    serviceArea: { center: { lat: 32.41, lng: -97.76 }, radiusKm: 20, zips: ['76048', '76049'], towns: ['Granbury'] },
    competitorLimit: 5,
    competitors: [
      { name: 'Cleburne Rooter & Drain', slug: 'cleburne-rooter', lat: 32.395, lng: -97.71 },
      { name: 'Twin Oaks Plumbing', slug: 'twin-oaks-plumbing', lat: 32.448, lng: -97.762 },
      { name: 'Comanche Peak Plumbing', slug: 'comanche-peak-plumbing', lat: 32.37, lng: -97.79 },
      { name: 'Stockton Bend Water Heaters', slug: 'stockton-bend-water-heaters', lat: 32.421, lng: -97.82 },
    ],
  },
  lakeside: {
    name: 'Lakeside Family Dental', verticalId: 'dental', status: 'prospect', features: [], services: [], // deviation 3
    keywords: ['dentist granbury', 'family dentist'],
    serviceArea: { center: GRANBURY, radiusKm: 15, zips: ['76048'] },
    competitorLimit: 5,
    competitors: [
      { name: 'Granbury Smiles Dental', slug: 'granbury-smiles', lat: 32.444, lng: -97.788 },
      { name: 'Harbor Lakes Family Dentistry', slug: 'harbor-lakes-dentistry', lat: 32.438, lng: -97.77 },
    ],
  },
};

const SOURCES = ['gbp', 'reviews', 'ads_google', 'ads_meta'] as const;

/** Spec §4.1. */
export async function seedTenancy(ctx: SeedContext): Promise<void> {
  const { db, clock, ids } = ctx;
  const [a] = await db.insert(agency).values({
    name: 'Brazos Digital',
    branding: { displayName: 'Brazos Digital', primary: '#1F7A8C', secondary: '#0F4C5C', fromName: 'Brazos Digital', signOff: 'The Brazos Digital team' },
    createdAt: clock.daysAgo(400),
  }).returning({ id: agency.id });
  ids.agencyId = a!.id;

  for (const key of ['loneStar', 'brazos', 'lakeside'] as const) {
    const s = CLIENT_SPECS[key];
    const [c] = await db.insert(client).values({
      agencyId: ids.agencyId, name: s.name, verticalId: s.verticalId, status: s.status, features: s.features, services: s.services, keywords: s.keywords,
      serviceArea: s.serviceArea, placeId: key === 'loneStar' ? LONE_STAR_PLACE_ID : null,
      scoreThresholds: key === 'loneStar' ? CLIENT_THRESHOLDS.loneStar : null, competitorLimit: s.competitorLimit,
      createdAt: clock.daysAgo(key === 'lakeside' ? 10 : 400),
    }).returning({ id: client.id });
    ids.clients[key] = c!.id;
    ids.competitors[key] = await seedCompetitors(ctx, key, s);
  }

  const [self] = await db.insert(competitor).values({ name: 'Lone Star Cooling', domain: 'lone-star-cooling.example', placeId: LONE_STAR_PLACE_ID, createdAt: clock.daysAgo(390) }).returning({ id: competitor.id });
  ids.selfLoneStar = self!.id;
  await db.update(client).set({ selfCompetitorId: self!.id }).where(eq(client.id, ids.clients.loneStar));

  const ls = ids.competitors.loneStar;
  const bz = ids.competitors.brazos;
  ids.noData = { pricing: ls[5]!.id, ads: ls[4]!.id, reviews: bz[3]!.id, rankings: ls[3]!.id };

  await seedUsers(ctx);
}

async function seedCompetitors(ctx: SeedContext, key: DemoClientKey, s: ClientSpec): Promise<DemoCompetitor[]> {
  const { db, clock, ids } = ctx;
  const out: DemoCompetitor[] = [];
  for (const spec of s.competitors) {
    const domain = `${spec.slug}.example`;
    const placeId = `demo-place-${spec.slug}`;
    const [row] = await db.insert(competitor).values({ name: spec.name, domain, placeId, createdAt: clock.daysAgo(395) }).returning({ id: competitor.id });
    const id = row!.id;
    await db.insert(clientCompetitor).values({ agencyId: ids.agencyId, clientId: ids.clients[key], competitorId: id, createdAt: clock.daysAgo(key === 'lakeside' ? 9 : 380) });
    out.push({ id, name: spec.name, slug: spec.slug, domain, placeId, lat: spec.lat, lng: spec.lng });
    if (key === 'lakeside') continue; // prospects get no recurring work
    const page = (path: string, pageType: string) => ({
      competitorId: id, url: `https://${domain}${path}`, pageType, source: 'nav', cadence: 'daily', active: true,
      lastCapturedAt: clock.daysAgo(0.5), nextDueAt: clock.daysAgo(-30), createdAt: clock.daysAgo(380),
    });
    const pages = await db.insert(trackedPage).values([page('/', 'home'), page('/pricing', 'pricing')]).returning({ id: trackedPage.id, pageType: trackedPage.pageType });
    ids.pages[id] = { home: pages.find((p) => p.pageType === 'home')!.id, pricing: pages.find((p) => p.pageType === 'pricing')!.id };
    await db.insert(competitorSource).values(SOURCES.map((source) => ({ competitorId: id, source, active: true, nextDueAt: clock.daysAgo(-30), lastRunAt: clock.daysAgo(1), lastStatus: 'ok' })));
  }
  return out;
}

/** Better Auth users plus memberships, made the way the app makes them: an invitation, then its acceptance. */
async function seedUsers(ctx: SeedContext): Promise<void> {
  const { db, clock, ids } = ctx;
  for (const u of DEMO_USERS) {
    const userId = `demo-user-${u.key}`;
    await db.execute(sql`insert into auth."user" (id, name, email, "emailVerified") values (${userId}, ${u.name}, ${u.email}, true)`);
    await createInvitation(db, { agencyId: ids.agencyId, email: u.email, role: u.role, clientId: u.client ? ids.clients[u.client] : null, invitedBy: 'demo-seed' }, clock.daysAgo(390));
    await acceptInvitations(db, { id: userId, email: u.email, name: u.name }, clock.daysAgo(389));
    const [m] = await db.select({ contactId: membership.contactId }).from(membership).where(eq(membership.userId, userId));
    if (!m?.contactId) throw new Error(`demo user ${u.key} has no contact after accepting its invitation`);
    ids.users[u.key] = { userId, contactId: m.contactId, email: u.email };
  }
}
