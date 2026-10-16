import { agencyOnboarding, agencyProfile } from '@cs/db';
import type { SeedContext } from './context';
import { DEMO_DOMAIN } from './users';

/**
 * Phase 10: the main demo agency is mid-wizard, so `/agency` shows the getting-started checklist and every
 * `/onboarding?step=…` page has data. Profile done, team skipped, plan and branding still open; it already has clients.
 * `redirected_at` is set: the demo admin is never bounced to the wizard on first sign-in.
 */
export async function seedOnboarding(ctx: SeedContext): Promise<void> {
  const { db, ids, clock } = ctx;
  await db.insert(agencyProfile).values({
    agencyId: ids.agencyId, legalName: 'Brazos Digital LLC', website: 'https://example.com', contactName: 'Avery Admin', contactRole: 'Owner',
    contactEmail: `admin@${DEMO_DOMAIN}`, phone: '(817) 555-0142', line1: '101 Pearl St', city: 'Granbury', region: 'TX', postalCode: '76048',
    country: 'US', timezone: 'America/Chicago', verticals: ['hvac_plumbing', 'dental'], billingEmail: `billing@${DEMO_DOMAIN}`, updatedAt: clock.daysAgo(3),
  });
  await db.insert(agencyOnboarding).values({
    agencyId: ids.agencyId, source: 'open', profileDoneAt: clock.daysAgo(3), teamSkippedAt: clock.daysAgo(3), firstClientAt: clock.daysAgo(2),
    redirectedAt: clock.daysAgo(3), nudgesSent: 1, createdAt: clock.daysAgo(3),
  });
}
