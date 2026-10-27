import { createAccessContext } from '@cs/core';
import { agencyBilling, agencyConnect, client, clientBilling, clientSetup, competitorSuggestion, contact, discoveryRun, invitation, withTenant } from '@cs/db';
import { IDS, openTestDbs, pauseAgency, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { clientBillingEligibility } from '../tools/client-billing';
import { completeIfDone, deriveSetupState, getSetupState, loadSetupInvite, ownerPickOpen, type SetupState } from './state';

const AREA = { center: { lat: 32.44, lng: -97.79 }, radiusKm: 10, zips: [] };
const CLIENT = { name: 'A1 HVAC', phone: '817-555-0100', keywords: ['ac repair'], serviceArea: AREA, placeId: 'ChIJx', status: 'active' };
const SETUP = { skipped: [] as string[], competitorsDoneAt: null as Date | null, ownerPickRequestedAt: null as Date | null, completedAt: null as Date | null, dismissedAt: null as Date | null };
const NOW = new Date('2026-10-16T12:00:00Z');
type In = Parameters<typeof deriveSetupState>[0];
// Default: details complete (name, phone, owner contact), no invite yet, billing ineligible (no Connect account) -> billing reads as skipped.
const base = (o: Partial<In> = {}): In => ({ client: CLIENT, setup: SETUP, hasOwnerContact: true, latestRun: null, hasPendingSuggestions: false, invite: { status: 'none' }, billing: { eligible: false, state: null }, ...o });
const done = { status: 'done' };
const PICKED = { ...SETUP, competitorsDoneAt: NOW };
const ASKED = { ...SETUP, ownerPickRequestedAt: NOW };
/** details, lookup, profile, competitors, invite, billing (billing absent for prospects). */
type Steps = string[];

const rows: { name: string; input: In; steps: Steps; open: boolean; exists?: boolean; waitingOn: SetupState['waitingOn']; refusal?: string | null; total?: 5 | 6 }[] = [
  { name: 'no row: closed, all six done', input: base({ setup: null }), steps: ['done', 'done', 'done', 'done', 'done', 'done'], open: false, exists: false, waitingOn: null },
  { name: 'details todo without a phone', input: base({ client: { ...CLIENT, phone: null } }), steps: ['todo', 'done', 'done', 'todo', 'todo', 'skipped'], open: true, waitingOn: 'agency' },
  { name: 'details todo without an owner contact', input: base({ hasOwnerContact: false }), steps: ['todo', 'done', 'done', 'todo', 'todo', 'skipped'], open: true, waitingOn: 'agency' },
  { name: 'profile incomplete (no keywords)', input: base({ client: { ...CLIENT, keywords: [] } }), steps: ['done', 'done', 'todo', 'todo', 'todo', 'skipped'], open: true, waitingOn: 'agency' },
  { name: 'profile stays done without a place id (P5: keywords + a centre)', input: base({ client: { ...CLIENT, placeId: null }, latestRun: done }), steps: ['done', 'done', 'done', 'ready', 'todo', 'skipped'], open: true, waitingOn: 'agency' },
  { name: 'profile incomplete (no service area)', input: base({ client: { ...CLIENT, serviceArea: null } }), steps: ['done', 'done', 'todo', 'todo', 'todo', 'skipped'], open: true, waitingOn: 'agency' },
  { name: 'profile done, no run -> competitors todo, agency', input: base(), steps: ['done', 'done', 'done', 'todo', 'todo', 'skipped'], open: true, waitingOn: 'agency' },
  ...['queued', 'searching', 'checking', 'finalising'].map((s) => ({ name: `run ${s} -> searching, system`, input: base({ latestRun: { status: s } }), steps: ['done', 'done', 'done', 'searching', 'todo', 'skipped'], open: true, waitingOn: 'system' as const })),
  { name: 'run failed -> blocked with refusal', input: base({ latestRun: { status: 'failed', error: 'budget' } }), steps: ['done', 'done', 'done', 'blocked', 'todo', 'skipped'], open: true, waitingOn: 'agency', refusal: 'budget' },
  { name: 'run done -> ready, agency', input: base({ latestRun: done, hasPendingSuggestions: true }), steps: ['done', 'done', 'done', 'ready', 'todo', 'skipped'], open: true, waitingOn: 'agency' },
  { name: 'legacy skipped search beats a failed run -> ready', input: base({ latestRun: { status: 'failed', error: 'x' }, setup: { ...SETUP, skipped: ['search'] } }), steps: ['done', 'done', 'done', 'ready', 'todo', 'skipped'], open: true, waitingOn: 'agency', refusal: null },
  { name: 'all six done or skipped, closed', input: base({ latestRun: done, setup: { ...PICKED, completedAt: NOW }, invite: { status: 'pending' } }), steps: ['done', 'done', 'done', 'done', 'done', 'skipped'], open: false, waitingOn: null },
  { name: 'competitors confirmed, invite todo -> still open, waiting on the agency', input: base({ latestRun: done, setup: PICKED }), steps: ['done', 'done', 'done', 'done', 'todo', 'skipped'], open: true, waitingOn: 'agency' },
  { name: 'invite accepted counts done', input: base({ latestRun: done, setup: PICKED, invite: { status: 'accepted' } }), steps: ['done', 'done', 'done', 'done', 'done', 'skipped'], open: true, waitingOn: null },
  { name: 'invite skipped', input: base({ latestRun: done, setup: { ...PICKED, skipped: ['invite'] } }), steps: ['done', 'done', 'done', 'done', 'skipped', 'skipped'], open: true, waitingOn: null },
  { name: 'billing eligible, off -> todo, waiting on the agency', input: base({ latestRun: done, setup: PICKED, invite: { status: 'pending' }, billing: { eligible: true, state: null } }), steps: ['done', 'done', 'done', 'done', 'done', 'todo'], open: true, waitingOn: 'agency' },
  { name: 'billing eligible, cancelled -> todo', input: base({ latestRun: done, setup: PICKED, invite: { status: 'pending' }, billing: { eligible: true, state: 'cancelled' } }), steps: ['done', 'done', 'done', 'done', 'done', 'todo'], open: true, waitingOn: 'agency' },
  ...(['invited', 'active', 'payment_needed'] as const).map((st) => ({ name: `billing ${st} -> done`, input: base({ latestRun: done, setup: PICKED, invite: { status: 'pending' }, billing: { eligible: true, state: st } }), steps: ['done', 'done', 'done', 'done', 'done', 'done'], open: true, waitingOn: null })),
  { name: 'all skipped (profile done), closed', input: base({ setup: { ...SETUP, skipped: ['search', 'competitors', 'invite'], competitorsDoneAt: NOW, completedAt: NOW } }), steps: ['done', 'done', 'done', 'skipped', 'skipped', 'skipped'], open: false, waitingOn: null },
  { name: 'closed by dismissal', input: base({ setup: { ...SETUP, dismissedAt: NOW } }), steps: ['done', 'done', 'done', 'todo', 'todo', 'skipped'], open: false, waitingOn: null },
  { name: 'owner asked to pick -> waiting_owner; invite todo keeps the agency on', input: base({ latestRun: done, setup: ASKED }), steps: ['done', 'done', 'done', 'waiting_owner', 'todo', 'skipped'], open: true, waitingOn: 'agency' },
  { name: 'waiting_owner beats a running search', input: base({ latestRun: { status: 'searching' }, setup: ASKED }), steps: ['done', 'done', 'done', 'waiting_owner', 'todo', 'skipped'], open: true, waitingOn: 'agency' },
  { name: 'waiting_owner with every staff step settled -> waiting on the client', input: base({ latestRun: done, setup: ASKED, invite: { status: 'pending' } }), steps: ['done', 'done', 'done', 'waiting_owner', 'done', 'skipped'], open: true, waitingOn: 'client' },
  { name: 'the owner picked -> done', input: base({ latestRun: done, setup: { ...ASKED, competitorsDoneAt: NOW }, invite: { status: 'accepted' } }), steps: ['done', 'done', 'done', 'done', 'done', 'skipped'], open: true, waitingOn: null },
  { name: 'prospect has 5 steps (no billing)', input: base({ client: { ...CLIENT, status: 'prospect' }, latestRun: done, setup: PICKED, billing: { eligible: true, state: null } }), steps: ['done', 'done', 'done', 'done', 'todo'], open: true, waitingOn: 'agency', total: 5 },
  { name: 'prospect with a pending invite: every step done', input: base({ client: { ...CLIENT, status: 'prospect' }, latestRun: done, setup: PICKED, invite: { status: 'pending' } }), steps: ['done', 'done', 'done', 'done', 'done'], open: true, waitingOn: null, total: 5 },
];

describe('deriveSetupState', () => {
  it.each(rows)('$name', ({ input, steps, open, exists, waitingOn, refusal, total }) => {
    const s = deriveSetupState(input);
    expect(Object.values(s.steps)).toEqual(steps);
    expect(Object.keys(s.steps)).toEqual(['details', 'lookup', 'profile', 'competitors', 'invite', 'billing'].slice(0, steps.length));
    expect(s.competitors).toBe(s.steps.competitors);
    expect(s.totalSteps).toBe(total ?? 6);
    expect(s.open).toBe(open);
    expect(s.exists).toBe(exists ?? true);
    expect(s.waitingOn).toBe(waitingOn);
    expect(s.searchRefusal).toBe(refusal ?? null);
  });
  it('carries completedAt and dismissedAt', () => {
    const s = deriveSetupState(base({ setup: { ...SETUP, completedAt: NOW, dismissedAt: NOW } }));
    expect(s.completedAt).toEqual(NOW);
    expect(s.dismissedAt).toEqual(NOW);
  });
  it('details and lookup done for a created client', () => {
    const s = deriveSetupState(base({ client: { ...CLIENT, keywords: [], serviceArea: null, placeId: null } }));
    expect(s.steps).toMatchObject({ details: 'done', lookup: 'done', profile: 'todo' });
    expect('clientOpen' in s).toBe(false);
  });
  it('profile done with geocoded centre', () => {
    // No listing (no place id): the geocoded centre alone completes the profile with keywords (P5, O13).
    const s = deriveSetupState(base({ client: { ...CLIENT, placeId: null } }));
    expect(s.steps.profile).toBe('done');
    expect(s.needsLocation).toBe(false);
  });
  it('needsLocation whenever the service area has no centre', () => {
    for (const serviceArea of [null, { radiusKm: 10 }, { center: null }] as In['client']['serviceArea'][]) {
      expect(deriveSetupState(base({ client: { ...CLIENT, serviceArea, placeId: null } })).needsLocation).toBe(true);
      expect(deriveSetupState(base({ client: { ...CLIENT, serviceArea }, setup: null })).needsLocation).toBe(true);
    }
  });
});

describe('getSetupState / completeIfDone', () => {
  const dbs = openTestDbs();
  afterAll(() => dbs.closeAll());
  beforeEach(async () => {
    await truncateAll(dbs.owner);
    await seedTenancy(dbs.owner);
  });
  const D = 86_400_000;
  const insertSetup = (v: Partial<typeof clientSetup.$inferInsert> = {}) => dbs.owner.insert(clientSetup).values({ clientId: IDS.clientA1, agencyId: IDS.agencyA, ...v });
  /** Steps 1-3 done: phone + an owner contact (details), keywords + a centre (profile). */
  const profile = async () => {
    await dbs.owner.update(client).set({ phone: '817-555-0100', keywords: ['ac repair'], serviceArea: AREA, placeId: 'ChIJx' }).where(eq(client.id, IDS.clientA1));
    await dbs.owner.insert(contact).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, role: 'client_owner', email: 'pat@x.co', name: 'Pat', active: false });
  };
  const connect = (v: Partial<typeof agencyConnect.$inferInsert> = {}) =>
    dbs.owner.insert(agencyConnect).values({ agencyId: IDS.agencyA, stripeAccountId: 'acct_1', status: 'connected', chargesEnabled: true, detailsSubmitted: true, connectedAt: new Date(), ...v });
  /** Invites `o@x.co` as the owner (contact linked on the setup row) with the given invitation. */
  async function invite(inv: Partial<typeof invitation.$inferInsert> = {}, email = 'O@x.co') {
    const [c] = await dbs.owner.insert(contact).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, role: 'client_owner', email: 'o@x.co', name: 'Olive', active: false }).returning();
    await dbs.owner.update(clientSetup).set({ invitedContactId: c!.id }).where(eq(clientSetup.clientId, IDS.clientA1));
    await dbs.owner.insert(invitation).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, email, role: 'client_owner', invitedBy: 'x', expiresAt: new Date(Date.now() + 5 * D), ...inv });
  }

  it('no row reads as complete', async () => {
    expect(await getSetupState(dbs.service, IDS.clientA1)).toMatchObject({ exists: false, open: false, totalSteps: 6, competitors: 'done' });
  });

  it('a done search waits on the agency to pick; pending suggestions are open suggestions of the latest done run', async () => {
    await profile();
    await insertSetup();
    const [run] = await dbs.owner.insert(discoveryRun).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, trigger: 'auto', status: 'done', finishedAt: new Date() }).returning({ id: discoveryRun.id });
    expect(await getSetupState(dbs.service, IDS.clientA1)).toMatchObject({ waitingOn: 'agency', pendingSuggestions: false });
    const sug = { agencyId: IDS.agencyA, clientId: IDS.clientA1, runId: run!.id, name: 'Rival', appearances: 1, overlapScore: 0.5 };
    await dbs.owner.insert(competitorSuggestion).values({ ...sug, status: 'dismissed' });
    expect((await getSetupState(dbs.service, IDS.clientA1)).pendingSuggestions).toBe(false);
    await dbs.owner.insert(competitorSuggestion).values(sug);
    const s = await getSetupState(dbs.service, IDS.clientA1);
    expect(s.pendingSuggestions).toBe(true);
    expect(s.steps).toEqual({ details: 'done', lookup: 'done', profile: 'done', competitors: 'ready', invite: 'todo', billing: 'skipped' });
    expect(s.waitingOn).toBe('agency');
  });

  describe('invite step', () => {
    beforeEach(() => insertSetup());
    it('pending (case-insensitive email match) and accepted count done; none without an invited contact', async () => {
      expect((await getSetupState(dbs.service, IDS.clientA1)).steps.invite).toBe('todo');
      expect(await loadSetupInvite(dbs.service, IDS.clientA1)).toEqual({ status: 'none', name: null, email: null });
      await invite();
      expect((await getSetupState(dbs.service, IDS.clientA1)).steps.invite).toBe('done');
      expect(await loadSetupInvite(dbs.service, IDS.clientA1)).toEqual({ status: 'pending', name: 'Olive', email: 'o@x.co' });
      await dbs.owner.update(invitation).set({ acceptedAt: new Date(), acceptedBy: 'u1' });
      expect(await loadSetupInvite(dbs.service, IDS.clientA1)).toMatchObject({ status: 'accepted' });
    });
    it('expired or revoked invitations, other emails, other roles and other clients do not count', async () => {
      await invite({ expiresAt: new Date(Date.now() - 1000) });
      await dbs.owner.insert(invitation).values([
        { agencyId: IDS.agencyA, clientId: IDS.clientA1, email: 'other@x.co', role: 'client_owner', invitedBy: 'x', expiresAt: new Date(Date.now() + D) },
        { agencyId: IDS.agencyA, clientId: IDS.clientA2, email: 'o@x.co', role: 'client_owner', invitedBy: 'x', expiresAt: new Date(Date.now() + D) },
      ]);
      expect((await loadSetupInvite(dbs.service, IDS.clientA1)).status).toBe('none');
      await dbs.owner.update(invitation).set({ expiresAt: new Date(Date.now() + D), revokedAt: new Date() }).where(eq(invitation.email, 'O@x.co'));
      expect((await loadSetupInvite(dbs.service, IDS.clientA1)).status).toBe('none');
      await dbs.owner.update(invitation).set({ revokedAt: null, role: 'client_viewer' }).where(eq(invitation.email, 'O@x.co'));
      expect((await getSetupState(dbs.service, IDS.clientA1)).steps.invite).toBe('todo');
    });
  });

  describe('billing step', () => {
    beforeEach(() => insertSetup());
    const billing = async () => (await getSetupState(dbs.service, IDS.clientA1)).steps.billing;
    it('skipped without a ready Connect account or an eligible plan; todo when eligible; done once billing is on', async () => {
      expect(await billing()).toBe('skipped'); // no Connect account
      await connect({ chargesEnabled: false });
      expect(await billing()).toBe('skipped'); // connect_not_ready
      await dbs.owner.update(agencyConnect).set({ chargesEnabled: true });
      expect(await billing()).toBe('todo');
      await pauseAgency(dbs.owner, IDS.agencyA);
      expect(await billing()).toBe('skipped'); // billing_not_eligible
      await dbs.owner.update(agencyBilling).set({ state: 'active' });
      await dbs.owner.insert(clientBilling).values({ clientId: IDS.clientA1, agencyId: IDS.agencyA, state: 'invited', enabled: false });
      expect(await billing()).toBe('todo'); // state only counts while enabled
      await dbs.owner.update(clientBilling).set({ enabled: true });
      expect(await billing()).toBe('done');
    });
    it('clientBillingEligibility reports the same refusals as enable_client_billing', async () => {
      expect(await clientBillingEligibility(dbs.service, IDS.agencyA)).toMatchObject({ ok: false, code: 'conflict' });
      await connect({ status: 'pending' });
      expect(await clientBillingEligibility(dbs.service, IDS.agencyA)).toMatchObject({ ok: false, code: 'connect_not_ready' });
      await dbs.owner.update(agencyConnect).set({ status: 'connected' });
      expect(await clientBillingEligibility(dbs.service, IDS.agencyA)).toMatchObject({ ok: true, acct: 'acct_1' });
      await pauseAgency(dbs.owner, IDS.agencyA, 'suspended');
      expect(await clientBillingEligibility(dbs.service, IDS.agencyA)).toMatchObject({ ok: false, code: 'billing_not_eligible' });
    });
  });

  it('completeIfDone is idempotent and never clears completed_at', async () => {
    await profile();
    await insertSetup({ skipped: ['search', 'competitors', 'invite'] });
    expect(await completeIfDone(dbs.service, IDS.clientA1, NOW)).toBe(true);
    expect(await completeIfDone(dbs.service, IDS.clientA1, new Date(NOW.getTime() + 1000))).toBe(false);
    expect((await dbs.owner.select().from(clientSetup))[0]!.completedAt).toEqual(NOW);
    await dbs.owner.update(client).set({ placeId: null }).where(eq(client.id, IDS.clientA1));
    expect(await completeIfDone(dbs.service, IDS.clientA1, NOW)).toBe(false);
    expect((await dbs.owner.select().from(clientSetup))[0]!.completedAt).toEqual(NOW);
  });

  it('completeIfDone needs all six client steps: invite and an eligible billing step keep it open', async () => {
    await profile();
    await insertSetup({ skipped: ['search', 'competitors'], competitorsDoneAt: NOW });
    expect(await completeIfDone(dbs.service, IDS.clientA1, NOW)).toBe(false); // invite todo
    await invite();
    await connect();
    expect(await completeIfDone(dbs.service, IDS.clientA1, NOW)).toBe(false); // billing todo
    await dbs.owner.insert(clientBilling).values({ clientId: IDS.clientA1, agencyId: IDS.agencyA, state: 'invited', enabled: true });
    expect(await completeIfDone(dbs.service, IDS.clientA1, NOW)).toBe(true);
  });

  it('completeIfDone uses the prospect step list (no billing)', async () => {
    await profile();
    await dbs.owner.update(client).set({ status: 'prospect' }).where(eq(client.id, IDS.clientA1));
    await connect(); // billing would be todo for a client
    await insertSetup({ skipped: ['search', 'competitors', 'invite'], competitorsDoneAt: NOW });
    expect((await getSetupState(dbs.service, IDS.clientA1)).totalSteps).toBe(5);
    expect(await completeIfDone(dbs.service, IDS.clientA1, NOW)).toBe(true);
  });

  it('completeIfDone leaves a dismissed row without completed_at', async () => {
    await profile();
    await insertSetup({ skipped: ['search', 'competitors', 'invite'], dismissedAt: NOW });
    expect(await completeIfDone(dbs.service, IDS.clientA1, NOW)).toBe(false);
    expect((await dbs.owner.select().from(clientSetup))[0]!.completedAt).toBeNull();
  });

  it('completeIfDone does nothing while a step is open', async () => {
    await profile();
    await insertSetup({ skipped: ['search'] });
    expect(await completeIfDone(dbs.service, IDS.clientA1, NOW)).toBe(false);
    expect((await dbs.owner.select().from(clientSetup))[0]!.completedAt).toBeNull();
  });

  it('details reports done only with a phone and an owner contact (a viewer is not the owner)', async () => {
    await insertSetup();
    const details = async () => (await getSetupState(dbs.service, IDS.clientA1)).steps.details;
    expect(await details()).toBe('todo');
    await dbs.owner.update(client).set({ phone: '817-555-0100' }).where(eq(client.id, IDS.clientA1));
    expect(await details()).toBe('todo');
    await dbs.owner.insert(contact).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, role: 'client_viewer', email: 'v@x.co', active: false });
    expect(await details()).toBe('todo');
    await dbs.owner.insert(contact).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, role: 'client_owner', email: 'o2@x.co', active: false });
    expect(await details()).toBe('done');
  });

  it('details todo does not block completion', async () => {
    // Pre-16 setups, prospects and accept_lead clients have no phone / owner contact: details is informational.
    await dbs.owner.update(client).set({ keywords: ['ac repair'], serviceArea: AREA }).where(eq(client.id, IDS.clientA1));
    await insertSetup({ skipped: ['competitors', 'invite'], competitorsDoneAt: NOW });
    expect((await getSetupState(dbs.service, IDS.clientA1)).steps.details).toBe('todo');
    expect(await completeIfDone(dbs.service, IDS.clientA1, NOW)).toBe(true);
  });

  it('completeIfDone counts waiting_owner as settled; competitors_done_at stays unset', async () => {
    await profile();
    await insertSetup({ skipped: ['invite'], ownerPickRequestedAt: NOW });
    expect((await getSetupState(dbs.service, IDS.clientA1)).competitors).toBe('waiting_owner');
    expect(await completeIfDone(dbs.service, IDS.clientA1, NOW)).toBe(true);
    const row = (await dbs.owner.select().from(clientSetup))[0]!;
    expect(row).toMatchObject({ completedAt: NOW, competitorsDoneAt: null });
    expect((await getSetupState(dbs.service, IDS.clientA1)).competitors).toBe('waiting_owner');
  });

  it('ownerPickOpen: only while owner_pick_requested_at is set and competitors_done_at is not; works in the owner tenant transaction', async () => {
    const owner = createAccessContext({ agencyId: IDS.agencyA, userId: 'u-owner', role: 'client_owner', clientScope: [IDS.clientA1], features: [] });
    const open = () => withTenant(dbs.app, owner, (tx) => ownerPickOpen(tx, IDS.clientA1));
    expect(await open()).toBe(false); // no row
    await insertSetup();
    expect(await open()).toBe(false); // never asked
    await dbs.owner.update(clientSetup).set({ ownerPickRequestedAt: NOW });
    expect(await open()).toBe(true);
    expect(await ownerPickOpen(dbs.service, IDS.clientA1)).toBe(true);
    await dbs.owner.update(clientSetup).set({ completedAt: NOW }); // completion does not close the window
    expect(await open()).toBe(true);
    await dbs.owner.update(clientSetup).set({ competitorsDoneAt: NOW });
    expect(await open()).toBe(false);
  });
});
