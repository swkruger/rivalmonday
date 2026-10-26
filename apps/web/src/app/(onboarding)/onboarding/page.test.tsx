// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  ctx: { role: 'agency_admin', agencyId: 'a1' } as { role: string; agencyId: string },
  status: { steps: {}, dismissed: false, completed: false, redirected: true, wizardFinished: false, source: 'open' } as Record<string, unknown>,
  profile: { name: 'Acme', contactName: 'Sam Lee', contactEmail: '', phone: '(512) 555-0142' } as Record<string, unknown>,
}));
vi.mock('@/server/current-viewer', () => ({ requireContext: async () => ({ ctx: m.ctx, viewer: { kind: 'user', email: 'sam@acme.co' } }) }));
vi.mock('@/server/help', () => ({ helpGuides: async () => new Set(['page:account.onboarding']) }));
vi.mock('@/server/tools', () => ({
  callTool: async (_c: unknown, name: string) => {
    if (m.ctx.role !== 'agency_admin') throw new Error('NEXT_NOT_FOUND');
    if (name === 'get_onboarding_status') return m.status;
    if (name === 'get_agency_profile') return m.profile;
    if (name === 'get_agency_branding') return { stored: { primary: '#163A5F' }, resolved: { displayName: 'Acme Brand' } };
    if (name === 'get_team') return { members: [{}], invitations: [{}, {}] };
    throw new Error(`unexpected ${name}`);
  },
}));
vi.mock('next/navigation', () => ({
  notFound: () => { throw new Error('NEXT_NOT_FOUND'); },
  redirect: (to: string) => { throw new Error(`NEXT_REDIRECT:${to}`); },
}));
const step = (name: string) => (p: Record<string, unknown>) => <div data-testid={name} data-props={JSON.stringify(p)} />;
vi.mock('./steps/about', () => ({ AboutStep: step('profile') }));
vi.mock('./steps/team', () => ({ TeamStep: step('team') }));
vi.mock('./steps/brand', () => ({ BrandStep: step('branding') }));
vi.mock('./steps/done', () => ({ DoneStep: step('done') }));

const { default: Page } = await import('./page');
const run = (sp: Record<string, string> = {}) => Page({ searchParams: Promise.resolve(sp) });
const OPEN = { profile: 'open', team: 'open', branding: 'open', first_client: 'open' };
const props = (id: string) => JSON.parse(screen.getByTestId(id).getAttribute('data-props')!) as Record<string, any>;

beforeEach(() => { m.ctx = { role: 'agency_admin', agencyId: 'a1' }; m.status = { ...m.status, steps: OPEN, completed: false, dismissed: false }; });
afterEach(cleanup);

describe('/onboarding page', () => {
  it('is a 404 for account managers', async () => {
    m.ctx = { role: 'account_manager', agencyId: 'a1' };
    await expect(run()).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('redirects to /agency once completed or dismissed', async () => {
    m.status = { ...m.status, steps: { ...OPEN, profile: 'done' } };
    m.status = { ...m.status, completed: true };
    await expect(run()).rejects.toThrow('NEXT_REDIRECT:/agency');
    m.status = { ...m.status, completed: false, dismissed: true };
    await expect(run()).rejects.toThrow('NEXT_REDIRECT:/agency');
  });

  it('renders the requested step, and pre-fills the contact email from the session', async () => {
    render(await run({ step: 'profile' }));
    expect(props('profile').initial.contactEmail).toBe('sam@acme.co');
    expect(props('profile').guide).toBe(true);
    cleanup();
    m.status = { ...m.status, steps: { ...OPEN, profile: 'done' } };
    render(await run({ step: 'team' }));
    expect(props('team')).toMatchObject({ agencyName: 'Acme Brand', inviterName: 'Sam Lee' });
  });

  it('an invalid or missing ?step= falls back to the first open step; with none open it shows the confirmation', async () => {
    m.status = { ...m.status, steps: { ...OPEN, profile: 'done', team: 'skipped' } };
    render(await run({ step: 'nope' }));
    expect(screen.getByTestId('branding')).toBeTruthy();
    cleanup();
    m.status = { ...m.status, steps: { ...OPEN, profile: 'done', team: 'skipped', branding: 'done' } };
    render(await run());
    expect(props('done')).toMatchObject({
      firstName: 'Sam',
      summary: { agency: 'Acme', contact: 'Sam Lee · (512) 555-0142', team: '2 invites sent', brand: 'Colour set', brandColor: '#163A5F' },
    });
  });

  it('step param ignored while profile open', async () => {
    m.status = { ...m.status, completed: true, steps: OPEN };
    render(await run({ step: 'done' }));
    expect(screen.getByTestId('profile')).toBeTruthy();
  });

  it('the plan step is not a wizard step any more', async () => {
    render(await run({ step: 'plan' }));
    expect(screen.getByTestId('profile')).toBeTruthy();
  });
});
