import { emailResend } from '@cs/db';
import { openTestDbs, truncateAll } from '@cs/db/test-helpers';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { PENDING_EMAIL_TTL_SECONDS, RESEND_PER_HOUR, emailHash, signPendingEmail, takeResendSlot, verifyPendingEmail } from './pending-email';

const SECRET = 's'.repeat(40);
const T0 = new Date('2026-10-23T12:00:00Z');
const at = (sec: number) => new Date(T0.getTime() + sec * 1000);

describe('pending-email cookie', () => {
  it('sign/verify round-trips and lower-cases', () => {
    const v = signPendingEmail(SECRET, { email: '  Pat@Acme.COM ', flow: 'signin', next: '/c/1/briefs' }, T0);
    expect(v).toMatch(/^[\w-]+\.[\w-]+$/);
    expect(verifyPendingEmail(SECRET, v, at(60))).toEqual({ email: 'pat@acme.com', flow: 'signin', next: '/c/1/briefs' });
    expect(verifyPendingEmail(SECRET, signPendingEmail(SECRET, { email: 'a@b.co', flow: 'signup', next: '/' }, T0), T0)).toEqual({ email: 'a@b.co', flow: 'signup', next: '/' });
  });

  it('tampered cookie is refused', () => {
    const v = signPendingEmail(SECRET, { email: 'pat@acme.com', flow: 'signin', next: '/' }, T0);
    const [payload, sig] = v.split('.') as [string, string];
    const forged = Buffer.from(JSON.stringify({ e: 'boss@acme.com', f: 'signin', n: '/', iat: Math.floor(T0.getTime() / 1000) })).toString('base64url');
    expect(verifyPendingEmail(SECRET, `${forged}.${sig}`, T0)).toBeNull();
    expect(verifyPendingEmail(SECRET, `${payload}.${sig.slice(0, -2)}AA`, T0)).toBeNull();
    expect(verifyPendingEmail(SECRET, `${payload}.${sig}.x`, T0)).toBeNull();
    expect(verifyPendingEmail(SECRET, payload, T0)).toBeNull();
    expect(verifyPendingEmail(SECRET, undefined, T0)).toBeNull();
    expect(verifyPendingEmail(SECRET, '', T0)).toBeNull();
  });

  it('expired cookie is refused (15 min)', () => {
    const v = signPendingEmail(SECRET, { email: 'pat@acme.com', flow: 'signup', next: '/' }, T0);
    expect(PENDING_EMAIL_TTL_SECONDS).toBe(900);
    expect(verifyPendingEmail(SECRET, v, at(899))).not.toBeNull();
    expect(verifyPendingEmail(SECRET, v, at(900))).toBeNull();
  });

  it('wrong secret is refused', () => {
    const v = signPendingEmail(SECRET, { email: 'pat@acme.com', flow: 'signin', next: '/' }, T0);
    expect(verifyPendingEmail('t'.repeat(40), v, T0)).toBeNull();
  });

  it('a validly signed payload of the wrong shape is refused', () => {
    const v = signPendingEmail(SECRET, { email: 'pat@acme.com', flow: 'other' as never, next: '/' }, T0);
    expect(verifyPendingEmail(SECRET, v, T0)).toBeNull();
    expect(verifyPendingEmail(SECRET, signPendingEmail(SECRET, { email: `${'a'.repeat(320)}@x.com`, flow: 'signin', next: '/' }, T0), T0)).toBeNull();
  });
});

describe('takeResendSlot', () => {
  const dbs = openTestDbs();
  afterAll(() => dbs.closeAll());
  beforeEach(() => truncateAll(dbs.owner));

  it('takeResendSlot allows 5 then refuses within an hour', async () => {
    const got: boolean[] = [];
    for (let i = 0; i < RESEND_PER_HOUR + 2; i++) got.push(await takeResendSlot(dbs.service, 'pat@acme.com', at(i * 60)));
    expect(got).toEqual([true, true, true, true, true, false, false]);
    const rows = await dbs.owner.select().from(emailResend);
    expect(rows).toHaveLength(5); // refusals are not recorded
    expect(rows.every((r) => r.emailHash === emailHash('pat@acme.com') && /^[0-9a-f]{64}$/.test(r.emailHash))).toBe(true);
  });

  it('counts per lower-cased address (Foo@x.com = foo@x.com)', async () => {
    for (let i = 0; i < 3; i++) expect(await takeResendSlot(dbs.service, 'Foo@x.com', at(i))).toBe(true);
    for (let i = 3; i < 5; i++) expect(await takeResendSlot(dbs.service, ' foo@X.COM ', at(i))).toBe(true);
    expect(await takeResendSlot(dbs.service, 'foo@x.com', at(10))).toBe(false);
    expect(await takeResendSlot(dbs.service, 'other@x.com', at(10))).toBe(true);
  });

  it("slots older than an hour don't count", async () => {
    for (let i = 0; i < 5; i++) expect(await takeResendSlot(dbs.service, 'pat@acme.com', at(i))).toBe(true);
    expect(await takeResendSlot(dbs.service, 'pat@acme.com', at(3599))).toBe(false);
    expect(await takeResendSlot(dbs.service, 'pat@acme.com', at(3601))).toBe(true);
  });

  it('concurrent requests for one address never take more than 5 slots', async () => {
    const results = await Promise.all(Array.from({ length: 8 }, () => takeResendSlot(dbs.service, 'race@acme.com', T0)));
    expect(results.filter(Boolean)).toHaveLength(5);
  });
});
