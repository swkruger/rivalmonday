import { client, clientSetup, competitorSuggestion, contact, discoveryRun, invitation, notification } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { addContact, type DeliveryConfig } from '@cs/engine';
import type { EmailPayload } from '@cs/email';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { seedUser, truncateAuth } from '../../test/fixtures';
import { queueCompetitorReview } from './review-email';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const NOW = new Date('2026-10-20T14:00:00Z');
const D = 86_400_000;
const delivery: DeliveryConfig = { appUrl: 'https://app.test', linkSecrets: ['s'.repeat(40)], fromAddress: 'briefs@app.test' };
const ID = IDS.clientA1;
const go = (dedupe = `competitor-review:${ID}`, manual = false, now = NOW) =>
  queueCompetitorReview(dbs.service, delivery, { agencyId: IDS.agencyA, clientId: ID, dedupe, now, manual });
const mails = () => dbs.owner.select().from(notification).where(eq(notification.kind, 'competitor_review'));
const payloadOf = (n: typeof notification.$inferSelect) => n.payload as unknown as EmailPayload & { cc: string[] };

async function seed(opts: { invitedBy?: string | null; invite?: 'pending' | 'accepted' | 'expired' | 'none'; contactActive?: boolean; competitorsDone?: boolean; rivals?: boolean } = {}) {
  const { invitedBy = 'inviter', invite = 'pending', contactActive = false, competitorsDone = false, rivals = true } = opts;
  await dbs.owner.update(client).set({ keywords: ['hvac'], serviceArea: { kind: 'radius', lat: 1, lng: 1, miles: 10 } as never, placeId: 'p1' }).where(eq(client.id, ID));
  const [c] = await dbs.owner.insert(contact).values({ agencyId: IDS.agencyA, clientId: ID, role: 'client_owner', email: 'owner@smith.co', active: contactActive }).returning();
  await dbs.owner.insert(clientSetup).values({ clientId: ID, agencyId: IDS.agencyA, invitedContactId: c!.id, invitedBy, competitorsDoneAt: competitorsDone ? NOW : null });
  if (invite !== 'none') {
    await dbs.owner.insert(invitation).values({
      agencyId: IDS.agencyA, clientId: ID, email: 'owner@smith.co', role: 'client_owner', invitedBy: 'inviter',
      expiresAt: new Date(NOW.getTime() + (invite === 'expired' ? -D : 5 * D)), acceptedAt: invite === 'accepted' ? NOW : null,
    });
  }
  if (rivals) {
    const [r] = await dbs.owner.insert(discoveryRun).values({ agencyId: IDS.agencyA, clientId: ID, status: 'done', trigger: 'auto', startedAt: new Date(NOW.getTime() - D) }).returning();
    const row = (i: number, tier: 'top' | 'watch' | 'minor', score: number, status = 'suggested') =>
      ({ agencyId: IDS.agencyA, clientId: ID, name: `Rival ${i}`, placeId: `rp${i}`, appearances: 3, bestRank: 1, overlapScore: score, runId: r!.id, tier, status });
    await dbs.owner.insert(competitorSuggestion).values([
      row(1, 'watch', 9), row(2, 'top', 1), row(3, 'top', 5), row(4, 'minor', 99), row(5, 'top', 3, 'dismissed'), row(6, 'watch', 2), row(7, 'watch', 1), row(8, 'watch', 0.5), row(9, 'watch', 0.1),
    ]);
  }
}

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await truncateAuth(dbs.owner);
  await seedTenancy(dbs.owner);
  await seedUser(dbs.owner, 'inviter', 'Inviter@Agency.co');
});

describe('queueCompetitorReview', () => {
  it('auto sends once across two runs', async () => {
    await seed();
    expect(await go()).toBe(true);
    expect(await go()).toBe(false);
    const rows = await mails();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ address: 'owner@smith.co' });
    expect(rows[0]!.dedupeKey).toMatch(new RegExp(`^competitor-review:${ID}:`));
    const props = payloadOf(rows[0]!).props as { competitorNames: string[]; reviewUrl: string };
    expect(props.competitorNames).toEqual(['Rival 3', 'Rival 2', 'Rival 1', 'Rival 6', 'Rival 7']); // top then watch, score desc, max 5, no minor/dismissed
    expect(props.reviewUrl).toBe(`https://app.test/sign-in?email=owner%40smith.co&next=${encodeURIComponent(`/c/${ID}/setup`)}`);
    expect(payloadOf(rows[0]!).cc).toEqual(['inviter@agency.co']);
  });

  it('no auto send when competitors done', async () => {
    await seed({ competitorsDone: true });
    expect(await go()).toBe(false);
    expect(await mails()).toHaveLength(0);
  });

  it('no auto send when competitors skipped', async () => {
    await seed();
    await dbs.owner.update(clientSetup).set({ skipped: ['competitors'], competitorsDoneAt: NOW });
    expect(await go()).toBe(false);
    expect(await go(`competitor-review:${ID}:2026-10-20`, true)).toBe(true);
  });

  it('no send without invited contact', async () => {
    await seed();
    await dbs.owner.update(clientSetup).set({ invitedContactId: null });
    expect(await go()).toBe(false);
    expect(await mails()).toHaveLength(0);
  });

  it('no send for an expired or missing invitation, an accepted-but-deactivated contact, or no rivals', async () => {
    await seed({ invite: 'expired' });
    expect(await go()).toBe(false);
    await truncateAll(dbs.owner);
    await seedTenancy(dbs.owner);
    await seed({ invite: 'accepted', contactActive: false });
    expect(await go()).toBe(false);
    await dbs.owner.update(contact).set({ active: true });
    expect(await go()).toBe(true);
    await truncateAll(dbs.owner);
    await seedTenancy(dbs.owner);
    await seed({ rivals: false });
    expect(await go()).toBe(false);
    await truncateAll(dbs.owner);
    await seedTenancy(dbs.owner);
    await seed({ invite: 'none' });
    expect(await go()).toBe(false);
  });

  it('manual send works after competitors done, once per day', async () => {
    await seed({ competitorsDone: true });
    expect(await go(`competitor-review:${ID}:2026-10-20`, true)).toBe(true);
    expect(await go(`competitor-review:${ID}:2026-10-20`, true)).toBe(false);
    expect(await go(`competitor-review:${ID}:2026-10-21`, true, new Date(NOW.getTime() + D))).toBe(true);
    expect(await mails()).toHaveLength(2);
  });

  it('props carry names only', async () => {
    await seed();
    await go();
    const props = payloadOf((await mails())[0]!).props as unknown as Record<string, unknown>;
    expect(Object.keys(props).sort()).toEqual(['branding', 'businessName', 'competitorNames', 'reviewUrl']);
    expect(JSON.stringify(props)).not.toMatch(/overlap_score|overlapScore|signals|ad_matches|appearances|best_rank|bestRank/);
  });

  it('cc falls back to the account manager', async () => {
    await seed({ invitedBy: null });
    await addContact(dbs.service, { agencyId: IDS.agencyA, role: 'account_manager', email: 'AM@a.example' });
    expect(await go()).toBe(true);
    expect(payloadOf((await mails())[0]!).cc).toEqual(['am@a.example']);
  });
});
