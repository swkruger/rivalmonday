import { createAccessContext, signLink } from '@cs/core';
import { brief, briefItem, contact, membership } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { seedAuthUsers, truncateAuth } from '../../test/auth-fixtures';
import { destinationPath, goDestination, goGate, openLink } from './links';
import type { Viewer } from './viewer';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const S = 'k'.repeat(40);
const NOW = new Date('2026-10-05T12:00:00Z');
let clientContact = '';
let agencyContact = '';
let briefId = '';
let itemId = '';

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await truncateAuth(dbs.owner);
  await seedTenancy(dbs.owner);
  await seedAuthUsers(dbs.owner, { id: 'u1', email: 'p@e.co', name: 'Pat' }, { id: 'u2', email: 's@e.co', name: 'Sam' });
  const [c] = await dbs.service.insert(contact).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, role: 'client_owner', email: 'p@e.co', userId: 'u1' }).returning();
  const [a] = await dbs.service.insert(contact).values({ agencyId: IDS.agencyA, role: 'account_manager', email: 'am@e.co' }).returning();
  clientContact = c!.id;
  agencyContact = a!.id;
  const [b] = await dbs.owner.insert(brief).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, deliveryDate: '2026-10-05', periodStart: NOW, periodEnd: NOW, status: 'sent' }).returning();
  briefId = b!.id;
  const [i] = await dbs.owner.insert(briefItem).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, briefId, ord: 1, competitorId: IDS.competitorX, headline: 'h', whatChanged: 'w', whyItMatters: 'y', recommendedAction: 'r', confidence: 0.9, effort: 'L', impact: 'H' }).returning();
  itemId = i!.id;
});

const token = (sub: string, t: 'brief' | 'brief_item' = 'brief', id = briefId) => signLink(S, { sub, agency: IDS.agencyA, client: IDS.clientA1, t, id }, NOW);
const open = (tok: string, sessionUserId: string | null = null, now = NOW) => openLink({ service: dbs.service, token: tok, secrets: [S], sessionUserId, now });

describe('destinationPath', () => {
  it('maps every target (decision 7)', () => {
    expect(destinationPath('brief', 'B', 'C')).toBe('/c/C/briefs/B');
    expect(destinationPath('brief_item', 'I', 'C', 'B')).toBe('/c/C/briefs/B#item-I');
    expect(destinationPath('brief_pdf', 'B', 'C')).toBe('/files/brief/B');
    expect(destinationPath('alert', 'A', 'C')).toBe('/c/C/alerts/A');
    expect(destinationPath('trend_report', 'R', 'C')).toBe('/c/C/reports/R');
    expect(destinationPath('trend_report_pdf', 'R', 'C')).toBe('/files/report/R');
    expect(destinationPath('digest', 'X', 'C')).toBe('/inbox');
    expect(destinationPath('notifications', 'C', 'C')).toBe('/inbox');
  });
});

describe('goGate (fix round 1: /go must not loop a member-less viewer through /sign-in)', () => {
  const userViewer: Viewer = {
    kind: 'user',
    userId: 'u1',
    email: 'p@e.co',
    name: 'Pat',
    ctx: createAccessContext({ agencyId: IDS.agencyA, userId: 'u1', role: 'agency_admin', clientScope: 'all', features: [] }),
    membership: { id: 'm1', agencyId: IDS.agencyA, agencyName: 'Agency A', role: 'agency_admin', clientId: null, clientName: null, clientScope: null, contactId: null, createdAt: NOW },
    memberships: [],
  };
  const memberLessViewer: Viewer = { kind: 'member-less', userId: 'u1', email: 'p@e.co', name: 'Pat' };
  const guestViewer: Viewer = { kind: 'guest', contactId: 'c1', ctx: createAccessContext({ agencyId: IDS.agencyA, userId: 'contact:x', role: 'client_viewer', clientScope: [IDS.clientA1], features: [] }) };

  it('lets a signed-in user through, carrying the narrowed viewer', () => {
    expect(goGate(userViewer)).toEqual({ kind: 'ok', viewer: userViewer });
  });

  it('sends a signed-in user with no membership to /no-access, not /sign-in (would loop forever)', () => {
    expect(goGate(memberLessViewer)).toEqual({ kind: 'no-access' });
  });

  it('sends an unauthenticated visitor to /sign-in', () => {
    expect(goGate(null)).toEqual({ kind: 'sign-in' });
  });

  it('sends a guest (contact link) viewer to /sign-in — guest sessions never satisfy /go', () => {
    expect(goGate(guestViewer)).toEqual({ kind: 'sign-in' });
  });
});

describe('openLink', () => {
  it('gives a client contact with no session a guest session', async () => {
    expect(await open(token(clientContact))).toEqual({ kind: 'redirect', to: `/c/${IDS.clientA1}/briefs/${briefId}`, guest: { contactId: clientContact, agencyId: IDS.agencyA, clientId: IDS.clientA1 } });
  });

  it('resolves brief items through their brief', async () => {
    expect(await open(token(clientContact, 'brief_item', itemId))).toMatchObject({ to: `/c/${IDS.clientA1}/briefs/${briefId}#item-${itemId}` });
  });

  it('sends agency contacts to sign in instead of a guest session', async () => {
    expect(await open(token(agencyContact))).toEqual({ kind: 'sign-in', next: `/c/${IDS.clientA1}/briefs/${briefId}` });
  });

  it('redirects the contact’s own signed-in user, selecting a matching membership', async () => {
    const [m] = await dbs.service.insert(membership).values({ userId: 'u1', agencyId: IDS.agencyA, role: 'client_owner', clientId: IDS.clientA1, contactId: clientContact, createdBy: 't' }).returning();
    expect(await open(token(clientContact), 'u1')).toEqual({ kind: 'redirect', to: `/c/${IDS.clientA1}/briefs/${briefId}`, membershipId: m!.id });
  });

  it('refuses to act for a different signed-in user (Review Focus 1)', async () => {
    expect(await open(token(clientContact), 'u2')).toEqual({ kind: 'other-account' });
  });

  it('expires tampered, out-of-date, revoked, inactive and cross-agency links (Review Focus 3)', async () => {
    expect(await open(`${token(clientContact)}x`)).toEqual({ kind: 'expired' });
    expect(await open(token(clientContact), null, new Date('2026-11-05T12:00:01Z'))).toEqual({ kind: 'expired' });
    await dbs.service.update(contact).set({ linksRevokedBefore: new Date('2026-10-05T12:00:01Z') }).where(eq(contact.id, clientContact));
    expect(await open(token(clientContact))).toEqual({ kind: 'expired' });
    await dbs.service.update(contact).set({ linksRevokedBefore: null, active: false }).where(eq(contact.id, clientContact));
    expect(await open(token(clientContact))).toEqual({ kind: 'expired' });
    const crossAgency = signLink(S, { sub: agencyContact, agency: IDS.agencyB, client: IDS.clientB1, t: 'brief', id: briefId }, NOW);
    expect(await open(crossAgency)).toEqual({ kind: 'expired' });
  });

  it('expires a brief_item link whose item is not in the token’s client', async () => {
    expect(await open(token(clientContact, 'brief_item', IDS.clientA2))).toEqual({ kind: 'expired' });
  });
});

describe('goDestination', () => {
  const admin = createAccessContext({ agencyId: IDS.agencyA, userId: 'a', role: 'agency_admin', clientScope: 'all', features: [] });
  const otherAgency = createAccessContext({ agencyId: IDS.agencyB, userId: 'b', role: 'agency_admin', clientScope: 'all', features: [] });
  it('finds the client through RLS-visible rows', async () => {
    expect(await goDestination(dbs.app, admin, 'brief', briefId)).toBe(`/c/${IDS.clientA1}/briefs/${briefId}`);
    expect(await goDestination(dbs.app, admin, 'brief_item', itemId)).toBe(`/c/${IDS.clientA1}/briefs/${briefId}#item-${itemId}`);
    expect(await goDestination(dbs.app, admin, 'notifications', IDS.clientA1)).toBe('/inbox');
  });
  it('returns null for other tenants, unknown targets and malformed ids', async () => {
    expect(await goDestination(dbs.app, otherAgency, 'brief', briefId)).toBeNull();
    expect(await goDestination(dbs.app, admin, 'evil', briefId)).toBeNull();
    expect(await goDestination(dbs.app, admin, 'brief', 'not-a-uuid')).toBeNull();
  });
});
