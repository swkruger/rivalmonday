import { hashInviteToken } from '@cs/billing';
import { agencyInviteLink, pendingSignup, platformSetting } from '@cs/db';
import { openTestDbs, truncateAll } from '@cs/db/test-helpers';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { FREE_MAIL_DOMAINS } from './free-mail';
import { checkInviteLink, hashIp, inviteProblemForLink, signupRateLimited, signupsPaused, trialAllowed } from './signup';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
beforeEach(async () => {
  await truncateAll(dbs.owner);
});
const NOW = new Date('2026-10-15T12:00:00Z');
const ago = (ms: number) => new Date(NOW.getTime() - ms);
const HOUR = 3_600_000;

async function signup(o: { email: string; ip?: string; at?: Date; source?: 'open' | 'invite'; done?: boolean }) {
  await dbs.service.insert(pendingSignup).values({
    email: o.email, agencyName: 'Acme', source: o.source ?? 'open', ipHash: o.ip ?? 'h1',
    createdAt: o.at ?? NOW, expiresAt: new Date(NOW.getTime() + HOUR), completedAt: o.done ? NOW : null,
  });
}

describe('free-mail + hashIp', () => {
  it('lists the free-mail domains', () => {
    expect(FREE_MAIL_DOMAINS.has('gmail.com')).toBe(true);
    expect(FREE_MAIL_DOMAINS.has('acme.com')).toBe(false);
    expect(FREE_MAIL_DOMAINS.size).toBe(20);
  });
  it('hashIp is a keyed, deterministic hex HMAC', () => {
    expect(hashIp('1.2.3.4', 's')).toMatch(/^[0-9a-f]{64}$/);
    expect(hashIp('1.2.3.4', 's')).toBe(hashIp('1.2.3.4', 's'));
    expect(hashIp('1.2.3.4', 's')).not.toBe(hashIp('1.2.3.4', 't'));
    expect(hashIp('1.2.3.4', 's')).not.toBe(hashIp('1.2.3.5', 's'));
  });
});

describe('signupRateLimited', () => {
  it('4 rows ok, 5 limited', async () => {
    for (let i = 0; i < 4; i++) await signup({ email: `a${i}@x.co`, done: true });
    expect(await signupRateLimited(dbs.service, 'h1', NOW)).toBe(false);
    await signup({ email: 'a4@x.co', done: true });
    expect(await signupRateLimited(dbs.service, 'h1', NOW)).toBe(true);
  });
  it('ignores rows older than an hour and other ips', async () => {
    for (let i = 0; i < 5; i++) await signup({ email: `a${i}@x.co`, at: ago(HOUR + 1000) });
    for (let i = 0; i < 5; i++) await signup({ email: `b${i}@x.co`, ip: 'h2' });
    expect(await signupRateLimited(dbs.service, 'h1', NOW)).toBe(false);
  });
});

describe('trialAllowed', () => {
  it('allows when nobody completed', async () => {
    await signup({ email: 'a@acme.com' });
    expect(await trialAllowed(dbs.service, 'a@acme.com', NOW)).toBe(true);
  });
  it('refuses the same email (case-insensitive) after a completed open sign-up', async () => {
    await signup({ email: 'a@acme.com', done: true });
    expect(await trialAllowed(dbs.service, ' A@Acme.com ', NOW)).toBe(false);
  });
  it('refuses the same company domain', async () => {
    await signup({ email: 'a@acme.com', done: true });
    expect(await trialAllowed(dbs.service, 'b@ACME.com', NOW)).toBe(false);
    expect(await trialAllowed(dbs.service, 'b@other.com', NOW)).toBe(true);
  });
  it('allows gmail twice for different addresses, not the same address', async () => {
    await signup({ email: 'a@gmail.com', done: true });
    expect(await trialAllowed(dbs.service, 'b@gmail.com', NOW)).toBe(true);
    expect(await trialAllowed(dbs.service, 'a@gmail.com', NOW)).toBe(false);
  });
  it('ignores invite sign-ups', async () => {
    await signup({ email: 'a@acme.com', done: true, source: 'invite' });
    expect(await trialAllowed(dbs.service, 'a@acme.com', NOW)).toBe(true);
  });
});

describe('signupsPaused', () => {
  it('false when missing, follows the setting', async () => {
    expect(await signupsPaused(dbs.service)).toBe(false);
    await dbs.service.insert(platformSetting).values({ key: 'signups_paused', value: { paused: true }, updatedBy: 't' });
    expect(await signupsPaused(dbs.service)).toBe(true);
  });
});

describe('checkInviteLink', () => {
  async function link(o: Partial<typeof agencyInviteLink.$inferInsert> = {}) {
    const token = 'rm_inv_tok';
    await dbs.service.insert(agencyInviteLink).values({
      tokenHash: hashInviteToken(token), tokenPrefix: 'rm_inv_tok', offer: 'trial', expiresAt: new Date(NOW.getTime() + HOUR), createdBy: 't', ...o,
    });
    return token;
  }
  it('unknown token', async () => {
    expect(await checkInviteLink(dbs.service, 'nope', null, NOW)).toEqual({ ok: false, problem: 'link_unknown' });
  });
  it('ok link', async () => {
    const r = await checkInviteLink(dbs.service, await link(), 'a@b.co', NOW);
    expect(r.ok).toBe(true);
  });
  it('revoked, expired, used up', async () => {
    expect(await checkInviteLink(dbs.service, await link({ revokedAt: ago(1000) }), null, NOW)).toEqual({ ok: false, problem: 'link_revoked' });
    await truncateAll(dbs.owner);
    expect(await checkInviteLink(dbs.service, await link({ expiresAt: NOW }), null, NOW)).toEqual({ ok: false, problem: 'link_expired' });
    await truncateAll(dbs.owner);
    expect(await checkInviteLink(dbs.service, await link({ maxUses: 2, uses: 2 }), null, NOW)).toEqual({ ok: false, problem: 'link_used_up' });
  });
  it('email lock is case-insensitive, skipped when email is null', async () => {
    const t = await link({ emailLock: 'Pat@Acme.com' });
    expect((await checkInviteLink(dbs.service, t, ' pat@ACME.com ', NOW)).ok).toBe(true);
    expect(await checkInviteLink(dbs.service, t, 'x@acme.com', NOW)).toEqual({ ok: false, problem: 'email_lock_mismatch' });
    expect((await checkInviteLink(dbs.service, t, null, NOW)).ok).toBe(true);
  });
});

describe('inviteProblemForLink', () => {
  async function linkRow(o: Partial<typeof agencyInviteLink.$inferInsert> = {}) {
    const [r] = await dbs.service.insert(agencyInviteLink).values({
      tokenHash: hashInviteToken('rm_inv_tok'), tokenPrefix: 'rm_inv_tok', offer: 'trial', expiresAt: new Date(NOW.getTime() + HOUR), createdBy: 't', ...o,
    }).returning();
    return r!.id;
  }
  it('null for a usable link, unknown for a missing id', async () => {
    expect(await inviteProblemForLink(dbs.service, await linkRow(), 'a@b.co', NOW)).toBeNull();
    expect(await inviteProblemForLink(dbs.service, '00000000-0000-4000-8000-000000000000', 'a@b.co', NOW)).toBe('link_unknown');
  });
  it('same problem order as checkInviteLink: revoked, expired, used up, email lock', async () => {
    expect(await inviteProblemForLink(dbs.service, await linkRow({ revokedAt: ago(1000), expiresAt: ago(1000) }), null, NOW)).toBe('link_revoked');
    await truncateAll(dbs.owner);
    expect(await inviteProblemForLink(dbs.service, await linkRow({ expiresAt: NOW, uses: 1 }), null, NOW)).toBe('link_expired');
    await truncateAll(dbs.owner);
    expect(await inviteProblemForLink(dbs.service, await linkRow({ uses: 1 }), null, NOW)).toBe('link_used_up');
    await truncateAll(dbs.owner);
    expect(await inviteProblemForLink(dbs.service, await linkRow({ emailLock: 'Pat@Acme.com' }), 'x@acme.com', NOW)).toBe('email_lock_mismatch');
  });
});
