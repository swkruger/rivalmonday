// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  ctx: { role: 'agency_admin', agencyId: 'a1' } as { role: string; agencyId: string },
  status: { steps: { profile: 'open', team: 'open', plan: 'open', branding: 'open', first_client: 'open' }, dismissed: false, completed: false, redirected: true, source: 'open' } as Record<string, unknown>,
}));
vi.mock('@/server/current-viewer', () => ({ requireContext: async () => ({ ctx: m.ctx, viewer: { kind: 'user' } }) }));
vi.mock('@/server/db', () => ({ dbs: () => ({ service: {} }) }));
vi.mock('@/server/timezones', () => ({ timezoneOptions: () => ['UTC'] }));
vi.mock('@/server/verticals', () => ({ verticalOptions: async () => [{ id: 'dental', name: 'Dental', services: [] }] }));
vi.mock('@cs/tools', () => ({ getAgencyBranding: async () => ({ stored: { displayName: 'Acme' }, resolved: { displayName: 'Acme' } }) }));
vi.mock('@/server/tools', () => ({
  callTool: async (_c: unknown, name: string) => {
    if (m.ctx.role !== 'agency_admin') throw new Error('NEXT_NOT_FOUND');
    if (name === 'get_onboarding_status') return m.status;
    if (name === 'get_agency_profile') return { name: 'Acme' };
    if (name === 'get_billing_summary') return { state: 'trialing' };
    throw new Error(`unexpected ${name}`);
  },
}));
vi.mock('next/navigation', () => ({
  notFound: () => { throw new Error('NEXT_NOT_FOUND'); },
  redirect: (to: string) => { throw new Error(`NEXT_REDIRECT:${to}`); },
}));
const step = (name: string) => () => <div data-testid={name} />;
vi.mock('./steps/profile', () => ({ ProfileStep: step('profile') }));
vi.mock('./steps/team', () => ({ TeamStep: step('team') }));
vi.mock('./steps/plan', () => ({ PlanStep: step('plan') }));
vi.mock('./steps/branding', () => ({ BrandingStep: step('branding') }));
vi.mock('./stepper', () => ({ Stepper: (p: { current: string }) => <div data-testid="stepper" data-current={p.current} /> }));

const { default: Page } = await import('./page');
const run = (sp: Record<string, string> = {}) => Page({ searchParams: Promise.resolve(sp) });
const OPEN = { profile: 'open', team: 'open', plan: 'open', branding: 'open', first_client: 'open' };

beforeEach(() => { m.ctx = { role: 'agency_admin', agencyId: 'a1' }; m.status = { ...m.status, steps: OPEN, completed: false, dismissed: false }; });
afterEach(cleanup);

describe('/onboarding page', () => {
  it('is a 404 for account managers', async () => {
    m.ctx = { role: 'account_manager', agencyId: 'a1' };
    await expect(run()).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('redirects to /agency once completed or dismissed', async () => {
    m.status = { ...m.status, completed: true };
    await expect(run()).rejects.toThrow('NEXT_REDIRECT:/agency');
    m.status = { ...m.status, completed: false, dismissed: true };
    await expect(run()).rejects.toThrow('NEXT_REDIRECT:/agency');
  });

  it('renders the requested step with its heading and the stepper', async () => {
    render(await run({ step: 'team' }));
    expect(screen.getByTestId('team')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Invite your team' })).toBeTruthy();
    expect(screen.getByText('Step 2 of 4')).toBeTruthy();
    expect(screen.getByTestId('stepper').getAttribute('data-current')).toBe('team');
  });

  it('an invalid or missing ?step= falls back to the first open step', async () => {
    m.status = { ...m.status, steps: { ...OPEN, profile: 'done', team: 'skipped' } };
    render(await run({ step: 'nope' }));
    expect(screen.getByRole('heading', { name: 'Your plan' })).toBeTruthy();
    cleanup();
    render(await run());
    expect(screen.getByTestId('plan')).toBeTruthy();
  });

  it('headings: Your agency, Make it yours', async () => {
    render(await run({ step: 'profile' }));
    expect(screen.getByRole('heading', { name: 'Your agency' })).toBeTruthy();
    cleanup();
    render(await run({ step: 'branding' }));
    expect(screen.getByRole('heading', { name: 'Make it yours' })).toBeTruthy();
  });
});
