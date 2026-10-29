import { hashInviteToken } from '@cs/billing';
import { agencyInviteLink, pendingSignup, platformSetting } from '@cs/db';
import { openTestDbs, truncateAll } from '@cs/db/test-helpers';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { startAgencySignup, startAgencySignupInput } from './signup';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
beforeEach(async () => {
  await truncateAll(dbs.owner);
});
const NOW = new Date('2026-10-15T12:00:00Z');
const DAY = 86_400_000;
const IP = 'a'.repeat(64);
const base = { email: 'Pat@Acme.com', agencyName: 'Acme Marketing', ipHash: IP };
const rows = () => dbs.service.select().from(pendingSignup);

async function link(o: Partial<typeof agencyInviteLink.$inferInsert> = {}) {
  const token = 'rm_inv_tok';
  const [r] = await dbs.service.insert(agencyInviteLink).values({
    tokenHash: hashInviteToken(token), tokenPrefix: 'rm_inv_tok', offer: 'trial', expiresAt: new Date(NOW.getTime() + DAY), createdBy: 't', ...o,
  }).returning({ id: agencyInviteLink.id });
  return { token, id: r!.id };
}

describe('startAgencySignupInput', () => {
  it('rejects bad input', () => {
    expect(() => startAgencySignupInput.parse({ ...base, email: 'nope' })).toThrow();
    expect(() => startAgencySignupInput.parse({ ...base, ipHash: 'short' })).toThrow();
    expect(() => startAgencySignupInput.parse({ ...base, inviteToken: 'bad_tok' })).toThrow();
  });
});

describe('startAgencySignup', () => {
  it('accepted open sign-up writes one normalised row with a 7 day expiry', async () => {
    expect(await startAgencySignup(dbs.service, { ...base, contactName: 'Pat' }, NOW)).toEqual({ ok: true, sendLink: true });
    const [r, ...rest] = await rows();
    expect(rest).toHaveLength(0);
    expect(r).toMatchObject({ email: 'pat@acme.com', agencyName: 'Acme Marketing', contactName: 'Pat', source: 'open', inviteLinkId: null, ipHash: IP });
    expect(r!.expiresAt.getTime()).toBe(NOW.getTime() + 7 * DAY);
  });

  it('a second submit overwrites rather than duplicates', async () => {
    await startAgencySignup(dbs.service, base, NOW);
    const later = new Date(NOW.getTime() + 1000);
    await startAgencySignup(dbs.service, { ...base, email: 'pat@acme.com', agencyName: 'Acme 2' }, later);
    const r = await rows();
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ agencyName: 'Acme 2', createdAt: later });
  });

  it('invite token: stores source and link id; an open resubmit clears the link id', async () => {
    const { token, id } = await link();
    expect(await startAgencySignup(dbs.service, { ...base, inviteToken: token }, NOW)).toEqual({ ok: true, sendLink: true });
    expect((await rows())[0]).toMatchObject({ source: 'invite', inviteLinkId: id });
    await startAgencySignup(dbs.service, base, NOW);
    const r = await rows();
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ source: 'open', inviteLinkId: null });
  });

  it('refusals return sendLink=false, write nothing and log only the reason', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    // invalid invite (unknown token)
    expect(await startAgencySignup(dbs.service, { ...base, inviteToken: 'rm_inv_nope' }, NOW)).toEqual({ ok: true, sendLink: false });
    // email lock mismatch
    const { token } = await link({ emailLock: 'other@acme.com' });
    expect(await startAgencySignup(dbs.service, { ...base, inviteToken: token }, NOW)).toEqual({ ok: true, sendLink: false });
    // paused
    await dbs.service.insert(platformSetting).values({ key: 'signups_paused', value: { paused: true }, updatedBy: 't' });
    expect(await startAgencySignup(dbs.service, base, NOW)).toEqual({ ok: true, sendLink: false });
    expect(await rows()).toHaveLength(0);
    const logged = info.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(logged).toContain('[signup] refused');
    expect(logged).not.toMatch(/acme\.com|rm_inv_|a{20}/i);
    info.mockRestore();
  });

  it('trial already used refuses; an invite bypasses the trial and paused checks', async () => {
    await dbs.service.insert(pendingSignup).values({
      email: 'old@acme.com', agencyName: 'Old', source: 'open', ipHash: 'x', expiresAt: NOW, completedAt: NOW,
    });
    vi.spyOn(console, 'info').mockImplementation(() => {});
    expect(await startAgencySignup(dbs.service, base, NOW)).toEqual({ ok: true, sendLink: false });
    expect(await rows()).toHaveLength(1);
    await dbs.service.insert(platformSetting).values({ key: 'signups_paused', value: { paused: true }, updatedBy: 't' });
    const { token } = await link();
    expect(await startAgencySignup(dbs.service, { ...base, inviteToken: token }, NOW)).toEqual({ ok: true, sendLink: true });
    vi.restoreAllMocks();
  });

  it('rate limit applies (also to invites)', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    for (let i = 0; i < 5; i++) {
      await dbs.service.insert(pendingSignup).values({ email: `r${i}@x${i}.co`, agencyName: 'R', source: 'open', ipHash: IP, createdAt: NOW, expiresAt: NOW });
    }
    expect(await startAgencySignup(dbs.service, base, NOW)).toEqual({ ok: true, sendLink: false });
    const { token } = await link();
    expect(await startAgencySignup(dbs.service, { ...base, inviteToken: token }, NOW)).toEqual({ ok: true, sendLink: false });
    expect(await rows()).toHaveLength(5);
    vi.restoreAllMocks();
  });

  it('invalid input throws', async () => {
    await expect(startAgencySignup(dbs.service, { ...base, email: 'nope' }, NOW)).rejects.toThrow();
  });
});

describe('pilot mode', () => {
  const pilotOn = () => dbs.service.insert(platformSetting).values({ key: 'pilot_mode', value: { on: true }, updatedBy: 't' });

  it('pilot_mode on refuses open sign-up and logs "pilot"', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    await pilotOn();
    expect(await startAgencySignup(dbs.service, base, NOW)).toEqual({ ok: true, sendLink: false });
    expect(await rows()).toHaveLength(0);
    expect(info.mock.calls.map((c) => c.join(' ')).join(' ')).toContain('[signup] refused pilot');
    info.mockRestore();
  });

  it('pilot_mode on still accepts a valid invite token', async () => {
    await pilotOn();
    const { token, id } = await link();
    expect(await startAgencySignup(dbs.service, { ...base, inviteToken: token }, NOW)).toEqual({ ok: true, sendLink: true });
    expect((await rows())[0]).toMatchObject({ source: 'invite', inviteLinkId: id });
  });
});

