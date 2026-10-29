import { vertical, waitlistEntry } from '@cs/db';
import { openTestDbs, truncateAll } from '@cs/db/test-helpers';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { hashToken } from '../intake/tokens';
import { CONFIRM_TTL_MS, confirmWaitlistEmail, submitWaitlistEntry, type WaitlistSubmit, waitlistSubmitSchema } from './public';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());

const NOW = new Date('2026-10-28T10:00:00Z');
const deps = { service: dbs.service };
const agency = (over: Record<string, unknown> = {}) => waitlistSubmitSchema.parse({
  kind: 'agency', contactName: 'Ada Lovelace', email: ' Ada@Agency.CO ', orgName: 'Agency Co', clientCountBand: '6-15', turnstileToken: 't', ...over,
});
const business = (over: Record<string, unknown> = {}) => waitlistSubmitSchema.parse({
  kind: 'business', contactName: 'Bo', email: 'bo@biz.co', orgName: 'Bo Plumbing', location: 'Austin, TX', turnstileToken: 't', ...over,
});
const submit = (input: WaitlistSubmit, ipHash = 'ip1', now = NOW) => submitWaitlistEntry(deps, { ...input, ipHash }, now);
const rows = () => dbs.service.select().from(waitlistEntry);

beforeEach(async () => {
  await truncateAll(dbs.owner);
  vi.restoreAllMocks();
});

describe('waitlistSubmitSchema', () => {
  it('business without website and location is invalid', () => {
    expect(waitlistSubmitSchema.safeParse({ kind: 'business', contactName: 'Bo', email: 'bo@biz.co', orgName: 'Bo', turnstileToken: 't' }).success).toBe(false);
  });
  it('contactName with a url is invalid', () => {
    for (const contactName of ['Visit https://evil.example now', 'www.evil.example', 'click evil.example/win', 'bit.ly']) {
      expect(waitlistSubmitSchema.safeParse({ kind: 'business', contactName, email: 'bo@biz.co', orgName: 'Bo', location: 'Austin', turnstileToken: 't' }).success, contactName).toBe(false);
      expect(waitlistSubmitSchema.safeParse({ kind: 'agency', contactName, email: 'bo@biz.co', orgName: 'Bo', clientCountBand: '6-15', turnstileToken: 't' }).success, contactName).toBe(false);
    }
  });

  it('sample business name with a domain is invalid', () => {
    for (const businessName of ['Smith.com', 'https://smith.co', 'www.smith', 'Smith Dental smith.co/offer']) {
      expect(waitlistSubmitSchema.safeParse({ kind: 'agency', contactName: 'Ada', email: 'a@a.co', orgName: 'A', clientCountBand: '6-15', turnstileToken: 't', sample: { businessName, location: 'Austin' } }).success, businessName).toBe(false);
    }
  });

  it('plain names still valid', () => {
    expect(() => agency({ contactName: "Ada J. O'Neil-Smith", orgName: 'Acme.io', sample: { businessName: "St. Louis Dental & Smith's HVAC", location: 'Austin' } })).not.toThrow();
    expect(() => business({ contactName: 'Mary-Ann St. Pierre' })).not.toThrow();
  });

  it('agency sample needs website or location', () => {
    const bad = waitlistSubmitSchema.safeParse({ kind: 'agency', contactName: 'A', email: 'a@a.co', orgName: 'A', clientCountBand: '1-5', turnstileToken: 't', sample: { businessName: 'Smith Dental' } });
    expect(bad.success).toBe(false);
    expect(agency({ sample: { businessName: 'Smith Dental', location: 'Austin' } }).kind).toBe('agency');
  });
});

describe('submitWaitlistEntry', () => {
  it('new agency entry stores lower-cased email and returns a send', async () => {
    const r = await submit(agency());
    expect(r.send).not.toBeNull();
    const [w] = await rows();
    expect(w).toMatchObject({ kind: 'agency', email: 'ada@agency.co', status: 'new', clientCountBand: '6-15', sampleRequested: false, sampleStatus: null, ipHash: 'ip1' });
    expect(w!.id).toBe(r.send!.entryId);
    expect(w!.confirmTokenHash).toBe(hashToken(r.send!.confirmRaw));
    expect(w!.confirmExpiresAt!.getTime()).toBe(NOW.getTime() + CONFIRM_TTL_MS);
  });

  it('sample request sets sample_status requested', async () => {
    await submit(agency({ sample: { businessName: 'Smith Dental', website: 'smith.co' } }));
    expect((await rows())[0]).toMatchObject({ sampleRequested: true, sampleStatus: 'requested', sampleBusinessName: 'Smith Dental', sampleWebsite: 'smith.co', sampleLocation: null });
  });

  it('resubmit of an unconfirmed row updates details and issues a new token', async () => {
    const a = await submit(agency());
    const b = await submit(agency({ orgName: 'Agency Two', sample: { businessName: 'X', location: 'Dallas' } }), 'ip2');
    expect(b.send!.confirmRaw).not.toBe(a.send!.confirmRaw);
    expect(b.send!.entryId).toBe(a.send!.entryId);
    const all = await rows();
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ orgName: 'Agency Two', sampleStatus: 'requested', ipHash: 'ip2', confirmTokenHash: hashToken(b.send!.confirmRaw) });
    expect(await confirmWaitlistEmail(deps, a.send!.confirmRaw, NOW)).toEqual({ expired: true });
  });

  it('resubmit of a confirmed row changes nothing but updated_at and returns send null', async () => {
    const a = await submit(agency());
    await confirmWaitlistEmail(deps, a.send!.confirmRaw, NOW);
    const before = (await rows())[0]!;
    const later = new Date(NOW.getTime() + 3_600_000);
    const b = await submit(agency({ orgName: 'Hijack', sample: { businessName: 'X', location: 'Dallas' } }), 'ip9', later);
    expect(b.send).toBeNull();
    const after = (await rows())[0]!;
    expect({ ...after, updatedAt: null }).toEqual({ ...before, updatedAt: null });
    expect(after.updatedAt).toEqual(later);
  });

  it('resubmit of an invited row returns send null', async () => {
    const a = await submit(agency());
    await dbs.service.update(waitlistEntry).set({ status: 'invited' }).where(eq(waitlistEntry.id, a.send!.entryId));
    const b = await submit(agency({ orgName: 'Hijack' }));
    expect(b.send).toBeNull();
    expect((await rows())[0]).toMatchObject({ orgName: 'Agency Co', status: 'invited', confirmTokenHash: hashToken(a.send!.confirmRaw) });
  });

  it('sixth submit from one ip hash in an hour returns send null and writes nothing', async () => {
    for (let i = 0; i < 5; i++) expect((await submit(business({ email: `b${i}@biz.co` }))).send).not.toBeNull();
    const sixth = await submit(business({ email: 'b5@biz.co' }));
    expect(sixth.send).toBeNull();
    expect(await rows()).toHaveLength(5);
    expect((await submit(business({ email: 'other@biz.co' }), 'ip2')).send).not.toBeNull();
  });

  it('unknown verticalId is stored null', async () => {
    await dbs.owner.insert(vertical).values([
      { id: 'plumbing', name: 'Plumbing', status: 'reviewed' },
      { id: 'old', name: 'Old', status: 'merged', mergedInto: 'plumbing' },
    ]);
    await submit(business({ email: 'a@biz.co', verticalId: 'nope', verticalOther: 'Pool cleaning' }));
    await submit(business({ email: 'b@biz.co', verticalId: 'plumbing' }));
    await submit(business({ email: 'c@biz.co', verticalId: 'old' }));
    const by = async (e: string) => (await rows()).find((r) => r.email === e)!;
    expect(await by('a@biz.co')).toMatchObject({ verticalId: null, verticalOther: 'Pool cleaning' });
    expect((await by('b@biz.co')).verticalId).toBe('plumbing');
    expect((await by('c@biz.co')).verticalId).toBeNull();
  });

  it('no pii in logs', async () => {
    const spies = (['log', 'info', 'warn', 'error'] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}));
    const a = await submit(agency({ email: 'secret.person@pii-agency.co', orgName: 'Secret Org Name' }), 'iphash-secret');
    await confirmWaitlistEmail(deps, a.send!.confirmRaw, NOW);
    await submit(agency({ email: 'secret.person@pii-agency.co', orgName: 'Secret Org Name' }), 'iphash-secret');
    for (let i = 0; i < 5; i++) await submit(business({ email: `p${i}@x.co` }), 'iphash-secret');
    const logged = spies.flatMap((s) => s.mock.calls).flat().map(String).join('\n');
    expect(logged).toContain('[waitlist]');
    for (const s of ['secret.person', 'pii-agency', 'Secret Org Name', 'iphash-secret', a.send!.confirmRaw]) expect(logged).not.toContain(s);
  });
});

describe('confirmWaitlistEmail', () => {
  it('confirm is idempotent until expiry', async () => {
    const a = await submit(agency());
    expect(await confirmWaitlistEmail(deps, a.send!.confirmRaw, new Date(NOW.getTime() + 1000))).toEqual({ ok: true });
    const first = (await rows())[0]!.emailConfirmedAt!;
    expect(first.getTime()).toBe(NOW.getTime() + 1000);
    expect(await confirmWaitlistEmail(deps, a.send!.confirmRaw, new Date(NOW.getTime() + 5000))).toEqual({ ok: true });
    expect((await rows())[0]!.emailConfirmedAt).toEqual(first);
  });

  it('expired token → expired', async () => {
    const a = await submit(agency());
    expect(await confirmWaitlistEmail(deps, a.send!.confirmRaw, new Date(NOW.getTime() + CONFIRM_TTL_MS))).toEqual({ expired: true });
    expect(await confirmWaitlistEmail(deps, 'garbage', NOW)).toEqual({ expired: true });
    expect((await rows())[0]!.emailConfirmedAt).toBeNull();
  });
});
