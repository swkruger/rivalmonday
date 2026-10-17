import type { MapsPlace } from '@cs/collectors';
import { type CallScope, createAccessContext } from '@cs/core';
import { agency, agencyBilling, intakeLink, lead, plan, type SetupLookup, vendorCall } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EnqueueJob, ToolDeps } from '../deps';
import { createToolRegistry } from '../registry';
import { FIND_BUSINESS_DAILY_CAP } from '../setup/lookup';
import { getPublicPreview, intakeLookup, resolveIntake, submitIntake, verifyIntake } from './public';
import { INTAKE_SIG_TTL_MS, signIntakePlace } from './signed';
import { hashToken } from './tokens';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());

const OP = '/serp/google/maps/live/advanced';
const NOW = new Date('2026-10-17T10:15:00Z');
const place = (i: number, over: Partial<MapsPlace> = {}): MapsPlace => ({
  placeId: `p${i}`, cid: `c${i}`, title: `Biz ${i}`, domain: null, url: null, rank: i, rating: 4, votes: 5, category: 'Dentist', address: 'x', lat: 1, lng: 2, city: 'Austin', phone: null, ...over,
});
const lookup = (placeId = 'p1'): SetupLookup => ({
  placeId, cid: null, title: 'Acme Dental', address: null, city: 'Austin', category: 'Dentist', phone: null, domain: null, rating: 4.5, votes: 10, lat: 1, lng: 2,
});

let scopes: CallScope[];
let enqueued: { job: string; data: Record<string, string>; key: string }[];
let enqueueImpl: EnqueueJob;
let deps: ToolDeps;

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
  await dbs.service.insert(intakeLink).values([
    { agencyId: IDS.agencyA, slug: 'agency-a' },
    { agencyId: IDS.agencyB, slug: 'agency-b', enabled: false },
  ]);
  scopes = [];
  enqueued = [];
  enqueueImpl = async (job, data, key) => { enqueued.push({ job, data, key }); };
  deps = {
    app: dbs.app,
    service: dbs.service,
    enqueue: (job, data, key) => enqueueImpl(job, data, key),
    // Mimics the web lookup: the vendor call is ledgered under the scope it is given.
    setupLookup: async (_q, scope) => {
      scopes.push(scope);
      await dbs.owner.insert(vendorCall).values({ agencyId: scope.agencyId, clientId: scope.clientId, vendor: 'dataforseo', operation: OP, units: 1, latencyMs: 1, ok: true });
      return [place(1), place(2, { lat: null }), place(3, { closed: true } as Partial<MapsPlace>)];
    },
  };
});

const SECRET = 's'.repeat(40);
const look = (slug: string | null, ipHash = 'iphash-1', now = NOW) => intakeLookup(deps, { slug, name: 'Acme', location: 'Austin, TX', ipHash, intakeSecret: SECRET }, now);
type SubmitOver = Partial<Omit<Parameters<typeof submitIntake>[1], 'lookup'>> & { place?: SetupLookup; lookup?: unknown };
/** Signs `place` (default `lookup()`) for the submit's slug, as intakeLookup would have; `lookup` posts a raw value instead. */
const submit = ({ place, ...over }: SubmitOver = {}, now = NOW) => {
  const slug = over.slug === undefined ? 'agency-a' : over.slug;
  const signed = signIntakePlace(place ?? lookup(), slug, SECRET, now);
  return submitIntake(deps, { slug, lookup: signed, contactName: 'Pat', email: 'pat@example.com', ipHash: 'iphash-1', intakeSecret: SECRET, ...over }, now);
};
const leads = () => dbs.service.select().from(lead);

describe('resolveIntake', () => {
  it('unknown and disabled slugs both resolve null', async () => {
    expect(await resolveIntake(dbs.service, 'nope')).toBeNull();
    expect(await resolveIntake(dbs.service, 'agency-b')).toBeNull();
    expect(await resolveIntake(dbs.service, 'agency-a')).toEqual({ agencyId: IDS.agencyA, branding: 'agency' });
    expect(await resolveIntake(dbs.service, null)).toEqual({ agencyId: null, branding: 'platform' });
  });

  it('suspended agency link resolves null', async () => {
    const [p] = await dbs.owner.insert(plan).values({ code: 'standard', version: 1, name: 'Standard', basePriceCents: 22900, includedSeats: 3, seatPriceCents: 9900, trialDays: 30, isCurrent: true, createdBy: 'test' }).returning({ id: plan.id });
    await dbs.owner.insert(agencyBilling).values({ agencyId: IDS.agencyA, state: 'suspended', planId: p!.id });
    expect(await resolveIntake(dbs.service, 'agency-a')).toBeNull();
    await dbs.owner.update(agencyBilling).set({ state: 'read_only' }).where(eq(agencyBilling.agencyId, IDS.agencyA));
    expect(await resolveIntake(dbs.service, 'agency-a')).toBeNull();
    expect(await submit()).toEqual({ send: null });
    await dbs.owner.update(agencyBilling).set({ state: 'active' }).where(eq(agencyBilling.agencyId, IDS.agencyA));
    expect(await resolveIntake(dbs.service, 'agency-a')).toEqual({ agencyId: IDS.agencyA, branding: 'agency' });
  });
});

describe('intakeLookup', () => {
  it('returns usable places only', async () => {
    const r = await look('agency-a');
    expect('places' in r && r.places.map((p) => p.place.placeId)).toEqual(['p1']);
  });

  it('signs each place for the page with a 1 h expiry; a place over the field caps is dropped', async () => {
    deps.setupLookup = async () => [place(1), place(2, { title: 'x'.repeat(201) }), place(3, { address: 'y'.repeat(301) })];
    const r = await look('agency-a');
    if (!('places' in r)) throw new Error('expected places');
    expect(r.places).toHaveLength(1);
    expect(r.places[0]).toEqual(signIntakePlace(r.places[0]!.place, 'agency-a', SECRET, NOW));
    expect(r.places[0]!.exp).toBe(NOW.getTime() + INTAKE_SIG_TTL_MS);
    expect(r.places[0]!.sig).toMatch(/^[0-9a-f]{64}$/);
  });

  it('lookup refused after 5 per IP per hour', async () => {
    for (let i = 0; i < 5; i++) expect(await look('agency-a')).toHaveProperty('places');
    expect(await look('agency-a')).toEqual({ refused: 'rate' });
    expect(await look(null)).toEqual({ refused: 'rate' }); // the IP key is shared across pages
    expect(await look('agency-a', 'iphash-2')).toHaveProperty('places');
    expect(await look('agency-a', 'iphash-1', new Date('2026-10-17T11:00:00Z'))).toHaveProperty('places');
    expect(scopes).toHaveLength(7);
  });

  it('link daily cap 50', async () => {
    for (let i = 0; i < 50; i++) expect(await look('agency-a', `ip-${i}`)).toHaveProperty('places');
    expect(await look('agency-a', 'ip-x')).toEqual({ refused: 'daily' });
    expect(await look(null, 'ip-y')).toHaveProperty('places'); // platform page has its own counter
    expect(await look('agency-a', 'ip-z', new Date('2026-10-18T00:00:00Z'))).toHaveProperty('places');
  });

  it('platform cap 200', async () => {
    for (let i = 0; i < 200; i++) expect(await look(null, `ip-${i}`)).toHaveProperty('places');
    expect(await look(null, 'ip-x')).toEqual({ refused: 'daily' });
    expect(await look('agency-a', 'ip-y')).toHaveProperty('places');
  });

  it('refuses unknown or disabled slugs without a vendor call', async () => {
    await expect(look('agency-b')).rejects.toMatchObject({ code: 'not_found' });
    await expect(look('nope')).rejects.toMatchObject({ code: 'not_found' });
    expect(scopes).toHaveLength(0);
  });

  it("intake lookups ledger with agency_id NULL and do not count toward find_business's daily cap", async () => {
    await dbs.owner.insert(vendorCall).values(Array.from({ length: FIND_BUSINESS_DAILY_CAP - 1 }, () => ({ agencyId: IDS.agencyA, clientId: null, vendor: 'dataforseo', operation: OP, units: 1, latencyMs: 1, ok: true })));
    for (let i = 0; i < 5; i++) await intakeLookup(deps, { slug: 'agency-a', name: 'Acme', location: 'Austin', ipHash: `ip-${i}`, intakeSecret: SECRET }, new Date());
    expect(scopes.every((s) => s.agencyId === null && s.clientId === null)).toBe(true);
    const nullRows = await dbs.service.select().from(vendorCall).where(sql`${vendorCall.agencyId} IS NULL`);
    expect(nullRows).toHaveLength(5);
    const registry = createToolRegistry(deps, { audit: { record: async () => {} } });
    const admin = createAccessContext({ agencyId: IDS.agencyA, userId: 'u-admin', role: 'agency_admin', clientScope: 'all', features: [] });
    await expect(registry.invoke(admin, 'find_business', { name: 'Smile', location: 'Austin, TX' })).resolves.toBeTruthy();
  });
});

describe('submitIntake', () => {
  it('submit twice updates one open lead', async () => {
    const a = await submit();
    const b = await submit({ contactName: 'Pat B', email: 'PAT@example.com', phone: '555', message: 'hi', ref: 'fb.ad-1', ipHash: 'iphash-2' });
    expect(a.send && b.send).toBeTruthy();
    expect(b.send!.leadId).toBe(a.send!.leadId);
    expect(b.send!.verifyRaw).not.toBe(a.send!.verifyRaw);
    const rows = await leads();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ agencyId: IDS.agencyA, source: 'agency_link', status: 'unverified', contactName: 'Pat B', phone: '555', message: 'hi', ref: 'fb.ad-1', ipHash: 'iphash-2', verifyTokenHash: hashToken(b.send!.verifyRaw) });
    expect(rows[0]!.verifyExpiresAt!.getTime()).toBe(NOW.getTime() + 48 * 3_600_000);
    // a different pool (platform) is a different lead
    const c = await submit({ slug: null, ipHash: 'iphash-3' });
    expect(c.send!.leadId).not.toBe(a.send!.leadId);
    expect((await leads()).find((r) => r.id === c.send!.leadId)).toMatchObject({ agencyId: null, source: 'platform' });
  });

  it('resubmit to a verified lead keeps its contact fields', async () => {
    const first = await submit({ phone: '111', message: 'orig', ref: 'r1' });
    await verifyIntake(deps, first.send!.verifyRaw, NOW);
    const second = await submit({ contactName: 'Mallory', phone: '999', message: 'spoof', ipHash: 'iphash-2' });
    expect(second.send!.leadId).toBe(first.send!.leadId);
    const [row] = await leads();
    expect(row).toMatchObject({ status: 'verified', contactName: 'Pat', phone: '111', message: 'orig', ipHash: 'iphash-1', ref: 'r1', verifyTokenHash: hashToken(second.send!.verifyRaw) });
    expect(row!.verifyExpiresAt!.getTime()).toBe(NOW.getTime() + 48 * 3_600_000);
  });

  it('resubmit without ref keeps the original ref', async () => {
    await submit({ ref: 'fb.ad-1' });
    await submit({ phone: '222' });
    const [row] = await leads();
    expect(row).toMatchObject({ ref: 'fb.ad-1', phone: '222' });
    await submit({ ref: 'google' });
    expect((await leads())[0]!.ref).toBe('google');
  });

  it('refused submit returns send null', async () => {
    expect(await submit({ slug: 'agency-b' })).toEqual({ send: null });
    expect(await submit({ slug: 'nope' })).toEqual({ send: null });
    expect(await submit({ email: 'not-an-email' })).toEqual({ send: null });
    expect(await submit({ contactName: '' })).toEqual({ send: null });
    expect(await submit({ ref: 'bad ref!' })).toEqual({ send: null });
    expect(await submit({ message: 'x'.repeat(501) })).toEqual({ send: null });
    expect(await submit({ lookup: { placeId: 'x' } })).toEqual({ send: null });
    expect(await leads()).toHaveLength(0);
  });

  it('a lookup signed by intakeLookup is accepted', async () => {
    const r = await look('agency-a');
    if (!('places' in r)) throw new Error('expected places');
    const s = await submitIntake(deps, { slug: 'agency-a', lookup: r.places[0], contactName: 'Pat', email: 'pat@example.com', ipHash: 'iphash-1', intakeSecret: SECRET }, NOW);
    expect(s.send).not.toBeNull();
    expect((await leads())[0]!.lookup).toEqual(r.places[0]!.place);
  });

  it('refuses a tampered, unsigned, re-targeted or wrongly keyed lookup', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const good = signIntakePlace(lookup(), 'agency-a', SECRET, NOW);
    expect(await submit({ lookup: { ...good, place: { ...good.place, title: 'Click https://evil.example now' } } })).toEqual({ send: null });
    expect(await submit({ lookup: { ...good, exp: good.exp + 1 } })).toEqual({ send: null });
    expect(await submit({ lookup: lookup() })).toEqual({ send: null }); // a bare, unsigned place
    expect(await submit({ lookup: { ...good, sig: 'f'.repeat(64) } })).toEqual({ send: null });
    expect(await submit({ slug: null, lookup: good })).toEqual({ send: null }); // signed for another page
    expect(await submit({ lookup: signIntakePlace(lookup(), 'agency-a', 't'.repeat(40), NOW) })).toEqual({ send: null });
    expect(await leads()).toHaveLength(0);
    expect(warn.mock.calls.flat().filter((m) => m === '[intake] refused signature')).toHaveLength(5);
    warn.mockRestore();
  });

  it('refuses an expired signature', async () => {
    const signed = signIntakePlace(lookup(), 'agency-a', SECRET, NOW);
    expect(await submit({ lookup: signed }, new Date(NOW.getTime() + INTAKE_SIG_TTL_MS + 1))).toEqual({ send: null });
    expect((await submit({ lookup: signed }, new Date(NOW.getTime() + INTAKE_SIG_TTL_MS - 1))).send).not.toBeNull();
  });

  it('refuses an over-long or out-of-range field even when signed', async () => {
    expect(await submit({ place: { ...lookup(), title: 'x'.repeat(201) } })).toEqual({ send: null });
    expect(await submit({ place: { ...lookup(), placeId: 'p'.repeat(301) } })).toEqual({ send: null });
    expect(await submit({ place: { ...lookup(), rating: 6 } })).toEqual({ send: null });
    expect(await submit({ place: { ...lookup(), votes: -1 } })).toEqual({ send: null });
    expect(await submit({ place: { ...lookup(), lat: 91 } })).toEqual({ send: null });
    expect(await leads()).toHaveLength(0);
  });

  it('daily submit cap: 50 per link, 200 for the platform page (UTC day)', async () => {
    for (let i = 0; i < 50; i++) expect((await submit({ ipHash: `ip-${i}`, place: lookup(`p${i}`) })).send).not.toBeNull();
    expect(await submit({ ipHash: 'ip-x', place: lookup('px') })).toEqual({ send: null });
    expect((await submit({ slug: null, ipHash: 'ip-y', place: lookup('py') })).send).not.toBeNull(); // own counter
    expect((await submit({ ipHash: 'ip-z', place: lookup('pz') }, new Date('2026-10-18T00:00:00Z'))).send).not.toBeNull();
    for (let i = 1; i < 200; i++) await submit({ slug: null, ipHash: `pip-${i}`, place: lookup(`q${i}`) });
    expect(await submit({ slug: null, ipHash: 'pip-x', place: lookup('qx') })).toEqual({ send: null });
  });

  it('submits have their own hourly IP budget: 5 lookups then a submit still succeeds; the 6th submit is refused', async () => {
    for (let i = 0; i < 5; i++) await look('agency-a', 'iphash-9');
    expect(await look('agency-a', 'iphash-9')).toEqual({ refused: 'rate' });
    expect((await submit({ ipHash: 'iphash-9' })).send).not.toBeNull();
    for (let i = 0; i < 4; i++) expect((await submit({ ipHash: 'iphash-9', place: lookup(`p${i + 2}`) })).send).not.toBeNull();
    expect(await submit({ ipHash: 'iphash-9', place: lookup('p9') })).toEqual({ send: null });
    expect(await leads()).toHaveLength(5);
  });
});

describe('verifyIntake', () => {
  it('verify sets verified, enqueues preview once; the link stays usable until it expires (idempotent)', async () => {
    const { send } = await submit();
    const v = await verifyIntake(deps, send!.verifyRaw, NOW);
    expect(v).toMatchObject({ leadId: send!.leadId });
    const [row] = await leads();
    expect(row).toMatchObject({ status: 'verified', verifyTokenHash: hashToken(send!.verifyRaw) });
    expect(row!.verifyExpiresAt).not.toBeNull();
    expect(row!.verifiedAt).toEqual(NOW);
    expect(row!.viewTokenHash).toBe(hashToken((v as { viewRaw: string }).viewRaw));
    expect(enqueued).toEqual([{ job: 'lead-preview', data: { leadId: send!.leadId }, key: `lead-preview:${send!.leadId}` }]);
    await dbs.service.update(lead).set({ preview: { status: 'pending' } }); // the job has picked it up
    const again = await verifyIntake(deps, send!.verifyRaw, NOW) as { leadId: string; viewRaw: string };
    expect(again.leadId).toBe(send!.leadId);
    expect(again.viewRaw).not.toBe((v as { viewRaw: string }).viewRaw);
    expect((await leads())[0]!.verifiedAt).toEqual(NOW);
    expect(enqueued).toHaveLength(1); // preview pending (not none/failed): no re-queue
    // past expiry, or once the lead is decided, the link is dead
    expect(await verifyIntake(deps, send!.verifyRaw, new Date(NOW.getTime() + 48 * 3_600_000 + 1))).toEqual({ expired: true });
    await dbs.service.update(lead).set({ status: 'accepted' });
    expect(await verifyIntake(deps, send!.verifyRaw, NOW)).toEqual({ expired: true });
  });

  it("a scanner pre-opening the link doesn't break the visitor's click", async () => {
    const { send } = await submit({}, new Date());
    await dbs.service.update(lead).set({ preview: { status: 'pending' } });
    const scanner = await verifyIntake(deps, send!.verifyRaw, new Date()) as { leadId: string; viewRaw: string };
    const visitor = await verifyIntake(deps, send!.verifyRaw, new Date()) as { leadId: string; viewRaw: string };
    expect(visitor.leadId).toBe(send!.leadId);
    expect(await getPublicPreview(dbs.service, visitor.leadId, visitor.viewRaw)).not.toBeNull();
    expect(scanner.viewRaw).not.toBe(visitor.viewRaw);
  });

  it('expired token', async () => {
    const { send } = await submit();
    expect(await verifyIntake(deps, send!.verifyRaw, new Date(NOW.getTime() + 48 * 3_600_000 + 1))).toEqual({ expired: true });
    expect(await verifyIntake(deps, 'garbage', NOW)).toEqual({ expired: true });
    expect((await leads())[0]!.status).toBe('unverified');
    expect(enqueued).toHaveLength(0);
  });

  it('verify succeeds when enqueue throws', async () => {
    enqueueImpl = async () => { throw new Error('Background jobs are not configured'); };
    const { send } = await submit();
    expect(await verifyIntake(deps, send!.verifyRaw, NOW)).toHaveProperty('viewRaw');
    const [row] = await leads();
    expect(row!.status).toBe('verified');
    expect(row!.preview).toEqual({ status: 'none' });
    const noQueue = { ...deps, enqueue: undefined };
    const s2 = await submitIntake(noQueue, { slug: null, lookup: signIntakePlace(lookup('p2'), null, SECRET, NOW), contactName: 'Q', email: 'q@example.com', ipHash: 'iphash-2', intakeSecret: SECRET }, NOW);
    expect(await verifyIntake(noQueue, s2.send!.verifyRaw, NOW)).toHaveProperty('viewRaw');
  });

  it('resubmit of a verified lead: new verify link works, issues a new view token, no second enqueue while preview is ready', async () => {
    const first = await submit();
    const v1 = await verifyIntake(deps, first.send!.verifyRaw, NOW) as { leadId: string; viewRaw: string };
    await dbs.service.update(lead).set({ preview: { status: 'ready', self: { name: 'Acme', rating: 4.5, votes: 10 }, nearby: [], facts: [], summary: null, category: 'Dentist', generatedAt: NOW.toISOString() } });
    const later = new Date(NOW.getTime() + 3_600_000);
    const second = await submit({ ipHash: 'iphash-2' }, later);
    expect(second.send!.leadId).toBe(first.send!.leadId);
    const v2 = await verifyIntake(deps, second.send!.verifyRaw, later) as { leadId: string; viewRaw: string };
    expect(v2.leadId).toBe(first.send!.leadId);
    expect(v2.viewRaw).not.toBe(v1.viewRaw);
    const [row] = await leads();
    expect(row).toMatchObject({ status: 'verified', verifyTokenHash: hashToken(second.send!.verifyRaw), viewTokenHash: hashToken(v2.viewRaw) });
    expect(row!.verifiedAt).toEqual(NOW); // kept
    expect(enqueued).toHaveLength(1);
    // a failed preview is retried on the next resubmit
    await dbs.service.update(lead).set({ preview: { status: 'failed' } });
    const third = await submit({ ipHash: 'iphash-3' }, later);
    await verifyIntake(deps, third.send!.verifyRaw, later);
    expect(enqueued).toHaveLength(2);
  });
});

describe('getPublicPreview', () => {
  it('getPublicPreview null for wrong token and wrong id', async () => {
    const { send } = await submit({}, new Date());
    const v = await verifyIntake(deps, send!.verifyRaw, new Date()) as { leadId: string; viewRaw: string };
    await dbs.owner.update(agency).set({ name: 'Internal Legal Name LLC', branding: { displayName: 'Bright Marketing', logoUrl: 'https://cdn.example.com/l.png', primary: '#112233', fromEmail: 'x@y.co' } }).where(eq(agency.id, IDS.agencyA));
    const ok = await getPublicPreview(dbs.service, v.leadId, v.viewRaw);
    expect(ok).toEqual({
      businessName: 'Acme Dental', preview: { status: 'none' }, branding: 'agency',
      agencyBranding: { displayName: 'Bright Marketing', logoUrl: 'https://cdn.example.com/l.png', primary: '#112233', secondary: '#2A6BAC', accent: '#F5A524', ink: '#0B2540', canvas: '#F6F9FC', panel: '#EEF2F6' },
    });
    expect(JSON.stringify(ok)).not.toContain('Internal Legal Name');
    expect(await getPublicPreview(dbs.service, v.leadId, 'wrong')).toBeNull();
    expect(await getPublicPreview(dbs.service, '00000000-0000-0000-0000-000000000001', v.viewRaw)).toBeNull();
    expect(await getPublicPreview(dbs.service, 'not-a-uuid', v.viewRaw)).toBeNull();
    // the view token lapses 30 days after verification
    await dbs.service.update(lead).set({ verifiedAt: sql`now() - interval '31 days'` }).where(eq(lead.id, v.leadId));
    expect(await getPublicPreview(dbs.service, v.leadId, v.viewRaw)).toBeNull();
  });

  it('platform leads carry platform branding and no agency name', async () => {
    const { send } = await submit({ slug: null }, new Date());
    const v = await verifyIntake(deps, send!.verifyRaw, new Date()) as { leadId: string; viewRaw: string };
    expect(await getPublicPreview(dbs.service, v.leadId, v.viewRaw)).toMatchObject({ branding: 'platform', agencyBranding: null });
  });
});
