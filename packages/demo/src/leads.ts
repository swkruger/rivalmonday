import { intakeLink, lead, type LeadPreview, type SetupLookup, waitlistEntry } from '@cs/db';
import { snapshotFacts } from '@cs/tools';
import type { SeedContext } from './context';
import { DEMO_DOMAIN } from './users';

/** The demo agency's public intake page: `/start/demo-agency`. */
export const DEMO_INTAKE_SLUG = 'demo-agency';

const place = (id: number, title: string, address: string, category: string, rating: number, votes: number, lat: number, lng: number): SetupLookup => ({
  placeId: `demo-place-lead-${id}`, cid: `91000000000000000${id}`, title, address, city: 'Granbury', category, phone: `(817) 555-02${id}0`, domain: null, rating, votes, lat, lng,
});

type Biz = { name: string; rating: number | null; votes: number | null };
type Near = Biz & { distanceKm: number };

/** A ready preview whose facts come from its own numbers (the same `snapshotFacts` the preview job uses). */
function ready(self: Biz, nearby: Near[], category: string, summary: string | null, generatedAt: Date): Extract<LeadPreview, { status: 'ready' }> {
  return { status: 'ready', self, nearby, facts: snapshotFacts({ self, nearby, category }), summary, category, generatedAt: generatedAt.toISOString() };
}

/**
 * Phase 11c: the demo agency's intake link and four leads. A new one (verified, preview ready), an accepted one (it became the
 * Lakeside Family Dental prospect), a declined one and one platform-pool lead no agency holds yet.
 */
export async function seedLeads(ctx: SeedContext): Promise<void> {
  const { db, ids, clock } = ctx;
  await db.insert(intakeLink).values({ agencyId: ids.agencyId, slug: DEMO_INTAKE_SLUG, enabled: true, createdAt: clock.daysAgo(20) });

  const base = { agencyId: ids.agencyId, source: 'agency_link' as const };
  const verified = (days: number) => ({ status: 'verified' as const, verifiedAt: clock.daysAgo(days), createdAt: clock.daysAgo(days), updatedAt: clock.daysAgo(days), confirmationSentAt: clock.daysAgo(days), agencyNotifiedAt: clock.daysAgo(days) });
  const rows: (typeof lead.$inferInsert)[] = [
    {
      ...base, ...verified(1), contactName: 'Olivia Oakridge', email: `olivia@oakridge-dental.${DEMO_DOMAIN}`, phone: '(817) 555-0142', message: 'We want to know how we compare to the dentists on the square.',
      ref: 'website', lookup: place(1, 'Oakridge Family Dental', '208 N Houston St, Granbury, TX 76048', 'Dentist', 4.6, 118, 32.4452, -97.7931), preview: ready(
        { name: 'Oakridge Family Dental', rating: 4.6, votes: 118 },
        [
          { name: 'Granbury Smiles Dental', rating: 4.8, votes: 342, distanceKm: 1.2 },
          { name: 'Harbor Lakes Family Dentistry', rating: 4.5, votes: 203, distanceKm: 2.9 },
          { name: 'Lakeview Dental Care', rating: 4.9, votes: 87, distanceKm: 3.4 },
        ],
        'Dentist', 'Two nearby dentists out-rate Oakridge Family Dental on Google, and Granbury Smiles Dental has 342 reviews to its 118.', clock.daysAgo(1),
      ),
    },
    {
      ...base, ...verified(9), contactName: 'Lena Lakeside', email: `lena@lakeside-dental.${DEMO_DOMAIN}`, phone: null, message: null,
      lookup: place(2, 'Lakeside Family Dental', '1105 E Pearl St, Granbury, TX 76048', 'Dentist', 4.7, 164, 32.4401, -97.7802),
      preview: ready(
        { name: 'Lakeside Family Dental', rating: 4.7, votes: 164 },
        [
          { name: 'Granbury Smiles Dental', rating: 4.8, votes: 342, distanceKm: 1.4 },
          { name: 'Harbor Lakes Family Dentistry', rating: 4.5, votes: 203, distanceKm: 2.1 },
        ],
        'Dentist', null, clock.daysAgo(9),
      ),
      status: 'accepted' as const, clientId: ids.clients.lakeside, decidedBy: ids.users.admin.userId, decidedAt: clock.daysAgo(8),
    },
    {
      ...base, ...verified(6), contactName: 'Dana Dropoff', email: `dana@dropoff-ortho.${DEMO_DOMAIN}`, phone: '(817) 555-0188', message: 'Looking for someone cheap.',
      lookup: place(3, 'Dropoff Orthodontics', '77 Tolar Hwy, Granbury, TX 76048', 'Orthodontist', 4.1, 22, 32.4311, -97.8123), preview: { status: 'failed' },
      status: 'declined' as const, decidedBy: ids.users.admin.userId, decidedAt: clock.daysAgo(5), declinedNotifiedAt: clock.daysAgo(5),
    },
    {
      agencyId: null, source: 'platform' as const, ...verified(2), contactName: 'Paul Pool', email: `paul@pool-plumbing.${DEMO_DOMAIN}`, phone: '(817) 555-0166', message: 'Need more calls in the summer.',
      lookup: place(4, 'Pool Plumbing & Drain', '14 Paluxy Rd, Tolar, TX 76476', 'Plumber', 4.4, 56, 32.3921, -97.9172),
      preview: ready(
        { name: 'Pool Plumbing & Drain', rating: 4.4, votes: 56 },
        [
          { name: 'Hood County Pipe Works', rating: 4.7, votes: 131, distanceKm: 3.2 },
          { name: 'Mustang Creek Plumbing', rating: 4.3, votes: 74, distanceKm: 5 },
        ],
        'Plumber', null, clock.daysAgo(2),
      ),
      agencyNotifiedAt: null, poolNotifiedAt: clock.daysAgo(2),
    },
  ];
  await db.insert(lead).values(rows);

  // Phase 17a: the pilot waitlist the platform Waitlist page lists (an agency with a sample request, a business, an unconfirmed agency).
  const wl = (days: number) => ({ ipHash: 'demo', createdAt: clock.daysAgo(days), updatedAt: clock.daysAgo(days) });
  await db.insert(waitlistEntry).values([
    {
      ...wl(2), kind: 'agency', contactName: 'Wes Waitlist', email: `wes@northstar-marketing.${DEMO_DOMAIN}`, orgName: 'North Star Marketing', clientCountBand: '6-15',
      emailConfirmedAt: clock.daysAgo(2), sampleRequested: true, sampleStatus: 'requested', sampleBusinessName: 'Oakridge Family Dental', sampleLocation: 'Granbury, TX',
    },
    { ...wl(3), kind: 'business', contactName: 'Bea Business', email: `bea@bluebonnet-hvac.${DEMO_DOMAIN}`, orgName: 'Bluebonnet Heating & Air', verticalId: 'hvac_plumbing', location: 'Granbury, TX', emailConfirmedAt: clock.daysAgo(3) },
    { ...wl(1), kind: 'agency', contactName: 'Una Unconfirmed', email: `una@lakeshore-seo.${DEMO_DOMAIN}`, orgName: 'Lakeshore SEO', clientCountBand: '1-5' },
  ]);
}
