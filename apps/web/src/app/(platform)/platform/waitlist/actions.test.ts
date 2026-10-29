import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ runTool: vi.fn(), email: vi.fn() }));
vi.mock('@/server/current-viewer', () => ({ requireOperatorContext: async () => ({ ctx: { userId: 'op' } }) }));
vi.mock('@/server/run-tool', () => ({ runTool: (...a: unknown[]) => m.runTool(...a) }));
vi.mock('@/server/invite-email', () => ({ sendAgencyInviteEmail: (...a: unknown[]) => m.email(...a) }));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));
const { approveSampleAction, inviteAgenciesAction, declineWaitlistEntryAction, sendSampleAction, stopSampleAction } = await import('./actions');

const form = (o: Record<string, string | string[]>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(o)) for (const x of Array.isArray(v) ? v : [v]) fd.append(k, x);
  return fd;
};
const EXP = '2026-11-11T00:00:00.000Z';

beforeEach(() => {
  m.email.mockReset().mockResolvedValue(undefined);
  m.runTool.mockReset();
});

describe('inviteAgenciesAction', () => {
  it('emails each invited row and lists failed links', async () => {
    m.runTool.mockResolvedValue({
      ok: true,
      data: { results: [
        { id: 'a', outcome: 'invited', email: 'a@x.co', url: 'https://app/join/A', expiresAt: EXP },
        { id: 'b', outcome: 'invited', email: 'b@x.co', url: 'https://app/join/B', expiresAt: EXP },
        { id: 'c', outcome: 'skipped', reason: 'not_new' },
      ] },
    });
    m.email.mockImplementation(async (i: { to: string }) => { if (i.to === 'b@x.co') throw new Error('smtp'); });
    const r = await inviteAgenciesAction(null, form({ ids: ['a', 'b', 'c'], 'org:a': 'Alpha', 'org:b': 'Beta', offer: 'pilot', pilotEndsAt: '2027-01-31' }));
    expect(m.runTool).toHaveBeenCalledWith({ userId: 'op' }, 'invite_waitlist_agencies', { ids: ['a', 'b', 'c'], offer: 'pilot', pilotEndsAt: '2027-01-31T23:59:59.000Z' });
    expect(m.email).toHaveBeenCalledTimes(2);
    expect(m.email).toHaveBeenNthCalledWith(1, { to: 'a@x.co', url: 'https://app/join/A', offer: 'pilot', pilotEndsAt: '2027-01-31T23:59:59.000Z', expiresAt: EXP });
    expect(r).toEqual({ ok: true, message: 'Invited 2. Skipped 1 (not confirmed or already handled).', failed: [{ orgName: 'Beta', url: 'https://app/join/B' }] });
  });

  it('a trial invite sends no end date; a pilot without one is refused before the tool', async () => {
    expect(await inviteAgenciesAction(null, form({ ids: ['a'], offer: 'pilot' }))).toEqual({ ok: false, error: 'Choose when the pilot ends' });
    expect(m.runTool).not.toHaveBeenCalled();
    m.runTool.mockResolvedValue({ ok: true, data: { results: [] } });
    await inviteAgenciesAction(null, form({ ids: ['a'], offer: 'trial', pilotEndsAt: '2027-01-31' }));
    expect(m.runTool.mock.calls[0]?.[2]).toEqual({ ids: ['a'], offer: 'trial' });
  });

  it('passes a tool refusal back and needs at least one row', async () => {
    expect(await inviteAgenciesAction(null, form({ offer: 'trial' }))).toMatchObject({ ok: false });
    m.runTool.mockResolvedValue({ ok: false, error: 'The pilot end date has already passed.' });
    expect(await inviteAgenciesAction(null, form({ ids: ['a'], offer: 'trial' }))).toEqual({ ok: false, error: 'The pilot end date has already passed.' });
    expect(m.email).not.toHaveBeenCalled();
  });
});

describe('declineWaitlistEntryAction', () => {
  it('declines one entry and reports it', async () => {
    m.runTool.mockResolvedValue({ ok: true, data: { ok: true } });
    expect(await declineWaitlistEntryAction({ ok: true }, form({ id: 'w1' }))).toMatchObject({ ok: true, message: 'Declined.' });
    expect(m.runTool).toHaveBeenCalledWith({ userId: 'op' }, 'decline_waitlist_entry', { id: 'w1' });
    m.runTool.mockResolvedValue({ ok: false, error: 'This entry was already handled.' });
    expect(await declineWaitlistEntryAction({ ok: true }, form({ id: 'w1' }))).toEqual({ ok: false, error: 'This entry was already handled.' });
  });
});

describe('sample actions', () => {
  const lookup = { placeId: 'p1', title: 'Smith Dental' };
  it('approve posts the listing and type and returns the setup url', async () => {
    m.runTool.mockResolvedValue({ ok: true, data: { status: 'approved', clientId: 'c1', setupUrl: '/c/c1/setup' } });
    expect(await approveSampleAction(null, form({ id: 'w1', verticalId: 'dental', lookup: JSON.stringify(lookup) }))).toEqual({ ok: true, setupUrl: '/c/c1/setup' });
    expect(m.runTool).toHaveBeenCalledWith({ userId: 'op' }, 'decide_sample_brief', { id: 'w1', approve: true, lookup, verticalId: 'dental' });
    expect(await approveSampleAction(null, form({ id: 'w1', verticalId: 'dental' }))).toEqual({ ok: false, error: 'Pick the listing and business type.' });
  });

  it('stop declines a request or stops a sample in progress', async () => {
    m.runTool.mockResolvedValue({ ok: true, data: { status: 'declined', clientId: null, setupUrl: null } });
    expect(await stopSampleAction({ ok: true }, form({ id: 'w1' }))).toEqual({ ok: true, message: 'Declined.' });
    expect(m.runTool).toHaveBeenCalledWith({ userId: 'op' }, 'decide_sample_brief', { id: 'w1', approve: false });
    m.runTool.mockResolvedValue({ ok: true, data: { status: 'failed', clientId: 'c1', setupUrl: null } });
    expect(await stopSampleAction({ ok: true }, form({ id: 'w1' }))).toEqual({ ok: true, message: 'Stopped.' });
  });

  it('send returns the link; an email failure keeps it with the notice', async () => {
    m.runTool.mockResolvedValue({ ok: true, data: { url: 'https://app/sample/T', expiresAt: EXP, emailed: true } });
    expect(await sendSampleAction(null, form({ id: 'w1' }))).toEqual({ ok: true, url: 'https://app/sample/T', message: 'Sample sent. The link works for 30 days:' });
    expect(m.runTool).toHaveBeenCalledWith({ userId: 'op' }, 'send_sample_brief', { id: 'w1' });
    m.runTool.mockResolvedValue({ ok: true, data: { url: 'https://app/sample/T', expiresAt: EXP, emailed: false } });
    expect(await sendSampleAction(null, form({ id: 'w1' }))).toEqual({ ok: true, url: 'https://app/sample/T', notice: 'Link created, but the email failed — copy the link below.' });
    m.runTool.mockResolvedValue({ ok: false, error: "The starting point isn't approved yet. Approve it in Approvals first." });
    expect(await sendSampleAction(null, form({ id: 'w1' }))).toEqual({ ok: false, error: "The starting point isn't approved yet. Approve it in Approvals first." });
  });
});
