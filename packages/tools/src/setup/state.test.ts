import { createAccessContext } from '@cs/core';
import { agencyBilling, agencyConnect, client, clientBilling, clientSetup, competitorSuggestion, contact, discoveryRun, invitation, withTenant } from '@cs/db';
import { IDS, openTestDbs, pauseAgency, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { clientBillingEligibility } from '../tools/client-billing';
import { clientSetupOpen, completeIfDone, deriveSetupState, getSetupState, loadSetupInvite, type SetupState } from './state';

const AREA = { center: { lat: 32.44, lng: -97.79 }, radiusKm: 10, zips: [] };
const CLIENT = { keywords: ['ac repair'], serviceArea: AREA, placeId: 'ChIJx', status: 'active' };
const SETUP = { skipped: [] as string[], competitorsDoneAt: null as Date | null, completedAt: null as Date | null, dismissedAt: null as Date | null };
const NOW = new Date('2026-10-16T12:00:00Z');
type In = Parameters<typeof deriveSetupState>[0];
// Default: no invite yet, billing ineligible (no Connect account) -> the billing step reads as skipped.
const base = (o: Partial<In> = {}): In => ({ client: CLIENT, setup: SETUP, latestRun: null, hasPendingSuggestions: false, invite: { status: 'none' }, billing: { eligible: false, state: null }, ...o });
const done = { status: 'done' };
const PICKED = { ...SETUP, competitorsDoneAt: NOW };
/** profile, search, competitors, invite, billing (billing absent for prospects). */
type Steps = string[];

const rows: { name: string; input: In; steps: Steps; open: boolean; clientOpen?: boolean; exists?: boolean; waitingOn: SetupState['waitingOn']; refusal?: string | null; total?: 4 | 5 }[] = [
  { name: 'no row: closed, all five done', input: base({ setup: null }), steps: ['done', 'done', 'done', 'done', 'done'], open: false, exists: false, waitingOn: null },
  { name: 'profile incomplete (no keywords)', input: base({ client: { ...CLIENT, keywords: [] } }), steps: ['todo', 'todo', 'todo', 'todo', 'skipped'], open: true, waitingOn: 'agency' },
  { name: 'profile incomplete after place-id removal', input: base({ client: { ...CLIENT, placeId: null }, latestRun: done }), steps: ['todo', 'done', 'todo', 'todo', 'skipped'], open: true, waitingOn: 'agency' },
  { name: 'profile incomplete (no service area)', input: base({ client: { ...CLIENT, serviceArea: null } }), steps: ['todo', 'todo', 'todo', 'todo', 'skipped'], open: true, waitingOn: 'agency' },
  { name: 'profile done, no run -> search todo, agency', input: base(), steps: ['done', 'todo', 'todo', 'todo', 'skipped'], open: true, waitingOn: 'agency' },
  { name: 'search queued -> running, system', input: base({ latestRun: { status: 'queued' } }), steps: ['done', 'running', 'todo', 'todo', 'skipped'], open: true, waitingOn: 'system' },
  ...['searching', 'checking', 'finalising'].map((s) => ({ name: `search ${s} -> running`, input: base({ latestRun: { status: s } }), steps: ['done', 'running', 'todo', 'todo', 'skipped'], open: true, waitingOn: 'system' as const })),
  { name: 'search failed -> blocked with refusal', input: base({ latestRun: { status: 'failed', error: 'budget' } }), steps: ['done', 'blocked', 'todo', 'todo', 'skipped'], open: true, waitingOn: 'agency', refusal: 'budget' },
  { name: 'all five done or skipped, closed', input: base({ latestRun: done, setup: { ...PICKED, completedAt: NOW }, invite: { status: 'pending' } }), steps: ['done', 'done', 'done', 'done', 'skipped'], open: false, waitingOn: null },
  { name: 'competitors confirmed, invite todo -> still open, waiting on the agency; closed for the client owner', input: base({ latestRun: done, setup: PICKED }), steps: ['done', 'done', 'done', 'todo', 'skipped'], open: true, clientOpen: false, waitingOn: 'agency' },
  { name: 'search skipped, competitors confirmed, invite pending counts done', input: base({ setup: { ...PICKED, skipped: ['search'] }, invite: { status: 'pending' } }), steps: ['done', 'skipped', 'done', 'done', 'skipped'], open: true, clientOpen: false, waitingOn: null },
  { name: 'invite accepted counts done', input: base({ latestRun: done, setup: PICKED, invite: { status: 'accepted' } }), steps: ['done', 'done', 'done', 'done', 'skipped'], open: true, clientOpen: false, waitingOn: null },
  { name: 'invite skipped', input: base({ latestRun: done, setup: { ...PICKED, skipped: ['invite'] } }), steps: ['done', 'done', 'done', 'skipped', 'skipped'], open: true, clientOpen: false, waitingOn: null },
  { name: 'billing eligible, off -> todo, waiting on the agency', input: base({ latestRun: done, setup: PICKED, invite: { status: 'pending' }, billing: { eligible: true, state: null } }), steps: ['done', 'done', 'done', 'done', 'todo'], open: true, clientOpen: false, waitingOn: 'agency' },
  { name: 'billing eligible, cancelled -> todo', input: base({ latestRun: done, setup: PICKED, invite: { status: 'pending' }, billing: { eligible: true, state: 'cancelled' } }), steps: ['done', 'done', 'done', 'done', 'todo'], open: true, clientOpen: false, waitingOn: 'agency' },
  ...(['invited', 'active', 'payment_needed'] as const).map((st) => ({ name: `billing ${st} -> done`, input: base({ latestRun: done, setup: PICKED, invite: { status: 'pending' }, billing: { eligible: true, state: st } }), steps: ['done', 'done', 'done', 'done', 'done'], open: true, clientOpen: false, waitingOn: null })),
  { name: 'billing skipped by staff', input: base({ latestRun: done, setup: { ...PICKED, skipped: ['billing'] }, invite: { status: 'pending' }, billing: { eligible: true, state: null } }), steps: ['done', 'done', 'done', 'done', 'skipped'], open: true, clientOpen: false, waitingOn: null },
  { name: 'all skipped (profile done), closed', input: base({ setup: { ...SETUP, skipped: ['search', 'competitors', 'invite'], competitorsDoneAt: NOW, completedAt: NOW } }), steps: ['done', 'skipped', 'skipped', 'skipped', 'skipped'], open: false, waitingOn: null },
  { name: 'search done, pending suggestions -> agency', input: base({ latestRun: done, hasPendingSuggestions: true }), steps: ['done', 'done', 'todo', 'todo', 'skipped'], open: true, waitingOn: 'agency' },
  { name: 'skipped search beats a failed run; competitors todo -> agency', input: base({ latestRun: { status: 'failed', error: 'x' }, setup: { ...SETUP, skipped: ['search'] } }), steps: ['done', 'skipped', 'todo', 'todo', 'skipped'], open: true, waitingOn: 'agency', refusal: null },
  { name: 'search done, zero rivals found (nothing to pick) -> agency, so reminders nudge', input: base({ latestRun: done }), steps: ['done', 'done', 'todo', 'todo', 'skipped'], open: true, waitingOn: 'agency' },
  { name: 'closed by dismissal', input: base({ setup: { ...SETUP, dismissedAt: NOW } }), steps: ['done', 'todo', 'todo', 'todo', 'skipped'], open: false, waitingOn: null },
  { name: 'prospect has 4 steps (no billing)', input: base({ client: { ...CLIENT, status: 'prospect' }, latestRun: done, setup: PICKED, billing: { eligible: true, state: null } }), steps: ['done', 'done', 'done', 'todo'], open: true, clientOpen: false, waitingOn: 'agency', total: 4 },
  { name: 'prospect with a pending invite: every step done', input: base({ client: { ...CLIENT, status: 'prospect' }, latestRun: done, setup: PICKED, invite: { status: 'pending' } }), steps: ['done', 'done', 'done', 'done'], open: true, clientOpen: false, waitingOn: null, total: 4 },
];

describe('deriveSetupState', () => {
  it.each(rows)('$name', ({ input, steps, open, clientOpen, exists, waitingOn, refusal, total }) => {
    const s = deriveSetupState(input);
    expect(Object.values(s.steps)).toEqual(steps);
    expect(Object.keys(s.steps)).toEqual(['profile', 'search', 'competitors', 'invite', 'billing'].slice(0, steps.length));
    expect(s.totalSteps).toBe(total ?? 5);
    expect(s.open).toBe(open);
    expect(s.clientOpen).toBe(clientOpen ?? open);
    expect(s.exists).toBe(exists ?? true);
    expect(s.waitingOn).toBe(waitingOn);
    expect(s.searchRefusal).toBe(refusal ?? null);
  });
  it('carries completedAt and dismissedAt', () => {
    const s = deriveSetupState(base({ setup: { ...SETUP, completedAt: NOW, dismissedAt: NOW } }));
    expect(s.completedAt).toEqual(NOW);
    expect(s.dismissedAt).toEqual(NOW);
  });
  it('client owner sees setup closed once their three steps are done while invite/billing are still todo', () => {
    const s = deriveSetupState(base({ latestRun: done, setup: PICKED, billing: { eligible: true, state: null } }));
    expect(s.steps).toMatchObject({ invite: 'todo', billing: 'todo' });
    expect(s).toMatchObject({ open: true, clientOpen: false });
    // Any of the owner's own steps still open (todo, running or blocked) keeps it open for them.
    for (const o of [{ latestRun: { status: 'searching' } }, { latestRun: { status: 'failed' } }, { setup: SETUP }, { client: { ...CLIENT, keywords: [] } }] as Partial<In>[]) {
      expect(deriveSetupState(base({ latestRun: done, setup: PICKED, ...o })).clientOpen).toBe(true);
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
  const profile = () => dbs.owner.update(client).set({ keywords: ['ac repair'], serviceArea: AREA, placeId: 'ChIJx' }).where(eq(client.id, IDS.clientA1));
  const connect = (v: Partial<typeof agencyConnect.$inferInsert> = {}) =>
    dbs.owner.insert(agencyConnect).values({ agencyId: IDS.agencyA, stripeAccountId: 'acct_1', status: 'connected', chargesEnabled: true, detailsSubmitted: true, connectedAt: new Date(), ...v });
  /** Invites `o@x.co` as the owner (contact linked on the setup row) with the given invitation. */
  async function invite(inv: Partial<typeof invitation.$inferInsert> = {}, email = 'O@x.co') {
    const [c] = await dbs.owner.insert(contact).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, role: 'client_owner', email: 'o@x.co', name: 'Olive', active: false }).returning();
    await dbs.owner.update(clientSetup).set({ invitedContactId: c!.id }).where(eq(clientSetup.clientId, IDS.clientA1));
    await dbs.owner.insert(invitation).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, email, role: 'client_owner', invitedBy: 'x', expiresAt: new Date(Date.now() + 5 * D), ...inv });
  }

  it('no row reads as complete', async () => {
    expect(await getSetupState(dbs.service, IDS.clientA1)).toMatchObject({ exists: false, open: false, clientOpen: false, totalSteps: 5 });
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
    expect(s.steps).toEqual({ profile: 'done', search: 'done', competitors: 'todo', invite: 'todo', billing: 'skipped' });
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

  it('completeIfDone needs all five client steps: invite and an eligible billing step keep it open', async () => {
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
    expect((await getSetupState(dbs.service, IDS.clientA1)).totalSteps).toBe(4);
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

  it('clientSetupOpen reads only the owner steps and works in the owner tenant transaction', async () => {
    const owner = createAccessContext({ agencyId: IDS.agencyA, userId: 'u-owner', role: 'client_owner', clientScope: [IDS.clientA1], features: [] });
    const open = () => withTenant(dbs.app, owner, (tx) => clientSetupOpen(tx, IDS.clientA1));
    expect(await open()).toBe(false); // no row
    await profile();
    await insertSetup({ skipped: ['search'] });
    expect(await open()).toBe(true);
    await dbs.owner.update(clientSetup).set({ competitorsDoneAt: NOW }); // invite still todo: open for staff, closed for the owner
    expect(await open()).toBe(false);
    expect((await getSetupState(dbs.service, IDS.clientA1)).open).toBe(true);
  });
});
