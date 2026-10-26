import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ ctx: { role: 'agency_admin' } as { role: string }, run: vi.fn() }));
vi.mock('@/server/current-viewer', () => ({ requireContext: async () => ({ ctx: m.ctx }) }));
vi.mock('@/server/run-tool', () => ({ runTool: (...a: unknown[]) => m.run(...a) }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({
  notFound: () => { throw new Error('NEXT_NOT_FOUND'); },
  redirect: (to: string) => { throw new Error(`NEXT_REDIRECT:${to}`); },
}));
const a = await import('./actions');

const fd = (o: Record<string, string | string[]>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) for (const x of Array.isArray(v) ? v : [v]) f.append(k, x);
  return f;
};
const initial = { ok: true } as const;
const names = () => m.run.mock.calls.map((c) => c[1]);

beforeEach(() => { m.run.mockReset().mockResolvedValue({ ok: true, data: { ok: true } }); m.ctx = { role: 'agency_admin' }; });

describe('onboarding actions', () => {
  it('every action is a 404 for non-admins', async () => {
    m.ctx = { role: 'account_manager' };
    await expect(a.saveBasicsAction(initial, fd({ name: 'A' }))).rejects.toThrow('NEXT_NOT_FOUND');
    await expect(a.inviteTeamAction(initial, fd({}))).rejects.toThrow('NEXT_NOT_FOUND');
    await expect(a.skipStepAction(fd({ step: 'team' }))).rejects.toThrow('NEXT_NOT_FOUND');
    await expect(a.saveBrandingStepAction(initial, fd({}))).rejects.toThrow('NEXT_NOT_FOUND');
    await expect(a.finishAction(fd({ to: 'client' }))).rejects.toThrow('NEXT_NOT_FOUND');
    expect(m.run).not.toHaveBeenCalled();
  });

  it('the removed plan actions are gone', () => {
    expect(a).not.toHaveProperty('saveProfileAction');
    expect(a).not.toHaveProperty('continuePlanAction');
    expect(a).not.toHaveProperty('startCheckoutAction');
  });

  it('saveBasicsAction calls save_agency_basics with the parsed form and moves to the team step', async () => {
    await expect(a.saveBasicsAction(initial, fd({
      name: ' Acme ', contactName: 'Ann Lee', contactEmail: 'a@acme.co', phone: '(404) 555-0100', line1: '1 Main St', line2: '', city: 'Austin', region: 'TX', postalCode: '78701',
      billingSameAsPostal: 'on', browserTimezone: 'America/Chicago',
    }))).rejects.toThrow('NEXT_REDIRECT:/onboarding?step=team');
    expect(m.run).toHaveBeenCalledWith(m.ctx, 'save_agency_basics', {
      name: 'Acme', contactName: 'Ann Lee', contactEmail: 'a@acme.co', phone: '(404) 555-0100',
      address: { line1: '1 Main St', line2: '', city: 'Austin', region: 'TX', postalCode: '78701' }, billingSameAsPostal: true, browserTimezone: 'America/Chicago',
    });
  });

  it('a blank address is sent as null, and the timezone is left out when the browser gave none', async () => {
    await expect(a.saveBasicsAction(initial, fd({ name: 'A' }))).rejects.toThrow('NEXT_REDIRECT');
    const input = m.run.mock.calls[0]![2] as Record<string, unknown>;
    expect(input).toMatchObject({ address: null, billingSameAsPostal: false });
    expect(input).not.toHaveProperty('browserTimezone');
  });

  it('saveBasicsAction returns the tool error and does not redirect', async () => {
    m.run.mockResolvedValue({ ok: false, error: 'Phone is wrong' });
    expect(await a.saveBasicsAction(initial, fd({ name: 'A' }))).toEqual({ ok: false, error: 'Phone is wrong' });
  });

  it('inviteTeamAction invites each filled row, marks the step done and moves to branding', async () => {
    await expect(a.inviteTeamAction(initial, fd({ email: ['x@a.co', '', 'y@a.co'], role: ['agency_admin', 'agency_admin', 'account_manager'] })))
      .rejects.toThrow('NEXT_REDIRECT:/onboarding?step=branding');
    expect(m.run.mock.calls.map((c) => [c[1], c[2]])).toEqual([
      ['invite_member', { email: 'x@a.co', role: 'agency_admin', clientId: null, clientScope: null }],
      ['invite_member', { email: 'y@a.co', role: 'account_manager', clientId: null, clientScope: null }],
      ['mark_onboarding_step', { step: 'team', action: 'done' }],
    ]);
  });

  it('inviteTeamAction with no rows just marks the step done (the primary button then reads "Continue")', async () => {
    await expect(a.inviteTeamAction(initial, fd({ email: [''], role: ['agency_admin'] }))).rejects.toThrow('NEXT_REDIRECT:/onboarding?step=branding');
    expect(names()).toEqual(['mark_onboarding_step']);
  });

  it('inviteTeamAction stops at the first failure, names the address and the rows already invited, and does not mark the step', async () => {
    m.run.mockResolvedValueOnce({ ok: true, data: {} }).mockResolvedValueOnce({ ok: false, error: 'Seat limit' });
    const r = await a.inviteTeamAction(initial, fd({ email: ['x@a.co', 'y@a.co'], role: ['agency_admin', 'agency_admin'] }));
    expect(r).toEqual({ ok: false, error: 'y@a.co: Seat limit. Already invited: x@a.co — remove those rows before trying again.' });
    expect(names()).toEqual(['invite_member', 'invite_member']);
  });

  it('does not double the full stop when the tool error already ends with punctuation', async () => {
    m.run.mockResolvedValueOnce({ ok: false, error: 'Seat limit.' });
    expect(await a.inviteTeamAction(initial, fd({ email: ['y@a.co'], role: ['agency_admin'] }))).toEqual({ ok: false, error: 'y@a.co: Seat limit.' });
  });

  it('skipStepAction skips team and branding only; team goes to branding, branding to the confirmation', async () => {
    await expect(a.skipStepAction(fd({ step: 'team' }))).rejects.toThrow('NEXT_REDIRECT:/onboarding?step=branding');
    expect(m.run).toHaveBeenLastCalledWith(m.ctx, 'mark_onboarding_step', { step: 'team', action: 'skip' });
    await expect(a.skipStepAction(fd({ step: 'branding' }))).rejects.toThrow('NEXT_REDIRECT:/onboarding?step=done');
    for (const bad of ['profile', 'done', 'plan', 'bogus']) await expect(a.skipStepAction(fd({ step: bad }))).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('saveBrandingStepAction saves branding, marks the step done and goes to the confirmation', async () => {
    await expect(a.saveBrandingStepAction(initial, fd({ displayName: 'Acme', primary: '#112233' }))).rejects.toThrow('NEXT_REDIRECT:/onboarding?step=done');
    expect(m.run.mock.calls.map((c) => [c[1], c[2]])).toEqual([
      ['update_agency_branding', { displayName: 'Acme', primary: '#112233' }],
      ['mark_onboarding_step', { step: 'branding', action: 'done' }],
    ]);
  });

  it('saveBrandingStepAction returns a branding error without marking the step', async () => {
    m.run.mockResolvedValue({ ok: false, error: 'primary must be a colour' });
    expect(await a.saveBrandingStepAction(initial, fd({ primary: 'red' }))).toEqual({ ok: false, error: 'primary must be a colour' });
    expect(names()).toEqual(['update_agency_branding']);
  });

  it('finishAction finishes onboarding then goes to the first client, or to the dashboard', async () => {
    await expect(a.finishAction(fd({ to: 'client' }))).rejects.toThrow('NEXT_REDIRECT:/agency/clients/new');
    expect(m.run).toHaveBeenLastCalledWith(m.ctx, 'finish_onboarding', {});
    await expect(a.finishAction(fd({ to: 'dashboard' }))).rejects.toThrow('NEXT_REDIRECT:/agency');
    expect(names()).toEqual(['finish_onboarding', 'finish_onboarding']);
  });

  it('finishAction is a 404 when the tool refuses', async () => {
    m.run.mockResolvedValue({ ok: false, error: 'Not found' });
    await expect(a.finishAction(fd({ to: 'client' }))).rejects.toThrow('NEXT_NOT_FOUND');
  });
});

describe('dismissChecklistAction', () => {
  it('runs dismiss_onboarding_checklist for admins', async () => {
    await a.dismissChecklistAction();
    expect(names()).toEqual(['dismiss_onboarding_checklist']);
  });
  it('is a 404 for non-admins', async () => {
    m.ctx = { role: 'account_manager' };
    await expect(a.dismissChecklistAction()).rejects.toThrow('NEXT_NOT_FOUND');
    expect(m.run).not.toHaveBeenCalled();
  });
});
