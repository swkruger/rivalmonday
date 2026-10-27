// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const C = '00000000-0000-4000-8000-0000000000c1';
const m = vi.hoisted(() => ({
  role: 'agency_admin' as string,
  state: {} as Record<string, unknown>,
  invite: { status: 'none', name: null, email: null } as Record<string, unknown>,
  suggestions: [] as unknown[],
  guides: new Set<string>(),
  calls: [] as string[],
}));
vi.mock('@/server/current-viewer', () => ({ requireContext: async () => ({ ctx: { role: m.role }, viewer: { kind: 'user' } }) }));
vi.mock('@/server/help', () => ({ helpGuides: async () => m.guides }));
vi.mock('@/server/theme', () => ({ themeForViewer: async () => ({ branding: { displayName: 'Brightside Marketing', logoUrl: null } }) }));
vi.mock('@/app/(app)/kb/actions', () => ({ loadPageGuide: vi.fn() }));
const tool = async (_ctx: unknown, name: string) => {
  m.calls.push(name);
  switch (name) {
    case 'get_client_profile': return { id: C, name: 'Cool Breeze', services: ['ac'], keywords: ['ac repair', 'furnace repair'], placeId: 'p1', serviceArea: { center: { lat: 1, lng: 2 }, radiusKm: 16.1, zips: [] } };
    case 'get_client_details': return { name: 'Cool Breeze', phone: '(512) 555-0187', address: { line1: '1801 Sam Bass Rd', city: 'Round Rock', region: 'TX', postalCode: '78681', country: 'US' }, logoUrl: null, contactName: 'Maria Alvarez', contactEmail: 'maria@x.com', locationSource: 'listing' };
    case 'get_client_setup': return { state: m.state, lookup: null, suggestions: { status: 'none' }, search: null, competitorSuggestions: m.suggestions, invite: m.invite, vertical: { name: 'HVAC', services: [], seedKeywords: [] } };
    case 'get_connect_status': return { status: 'connected', chargesEnabled: true, defaultPriceCents: 34900, defaultSetupFeeCents: null };
    case 'list_client_billing_status': return { clients: [{ clientId: C, nextPriceCents: 34900, setupFeeCents: null }] };
    default: throw new Error(`unexpected ${name}`);
  }
};
vi.mock('@/server/tools', () => ({ callTool: tool, tryCallTool: tool }));
vi.mock('next/navigation', () => ({
  notFound: () => { throw new Error('NEXT_NOT_FOUND'); },
  redirect: (to: string) => { throw new Error(`NEXT_REDIRECT:${to}`); },
  usePathname: () => `/c/${C}/setup`,
}));
vi.mock('./setup-wizard', () => ({ SetupWizard: (p: Record<string, unknown>) => <div data-testid="wizard" data-props={JSON.stringify({ ...p, view: undefined })} /> }));

const { default: SetupPage } = await import('./page');
const run = (sp: Record<string, string> = {}) => SetupPage({ params: Promise.resolve({ clientId: C }), searchParams: Promise.resolve(sp) });
const props = () => JSON.parse(screen.getByTestId('wizard').getAttribute('data-props')!) as Record<string, any>;
const open = (o: Record<string, unknown> = {}) => ({
  open: true, exists: true, totalSteps: 6, needsLocation: false, searchRefusal: null, dismissedAt: null, completedAt: null,
  competitors: 'todo', steps: { details: 'done', lookup: 'done', profile: 'todo', competitors: 'todo', invite: 'todo', billing: 'todo' }, ...o,
});

beforeEach(() => { m.role = 'agency_admin'; m.state = open(); m.invite = { status: 'none', name: null, email: null }; m.suggestions = []; m.guides = new Set(); m.calls = []; });
afterEach(cleanup);

describe('Setup page (steps 3-7 of the client flow)', () => {
  it('opens on the first open step with the viewer\'s list of screens', async () => {
    render(await run());
    expect(props()).toMatchObject({ clientId: C, clientName: 'Cool Breeze', current: 'profile', prospect: false, exitHref: '/agency', guide: false, steps: ['details', 'lookup', 'profile', 'competitors', 'invite', 'billing', 'done'] });
    expect(props().around).toBe('1801 Sam Bass Rd, Round Rock');
    expect(props().contact).toEqual({ name: 'Maria Alvarez', email: 'maria@x.com' });
    expect(props().agency).toEqual({ name: 'Brightside Marketing', logoUrl: null });
  });

  it('a requested earlier step opens; a later one falls back to the first open step', async () => {
    m.state = open({ steps: { details: 'done', lookup: 'done', profile: 'done', competitors: 'done', invite: 'todo', billing: 'todo' }, competitors: 'done' });
    render(await run({ step: 'profile' }));
    expect(props().current).toBe('profile');
    cleanup();
    render(await run({ step: 'billing' }));
    expect(props().current).toBe('invite');
  });

  it('a non-admin has no billing screen, and a prospect none either', async () => {
    m.role = 'account_manager';
    render(await run());
    expect(props().steps).toEqual(['details', 'lookup', 'profile', 'competitors', 'invite', 'done']);
    expect(m.calls).not.toContain('get_connect_status');
    cleanup();
    m.role = 'agency_admin';
    m.state = open({ totalSteps: 5, steps: { details: 'done', lookup: 'done', profile: 'todo', competitors: 'todo', invite: 'todo' } });
    render(await run());
    expect(props()).toMatchObject({ prospect: true, exitHref: '/agency/prospects' });
    expect(props().steps).toHaveLength(6);
  });

  it('reads the billing defaults only for the billing and confirmation screens', async () => {
    m.state = open({ competitors: 'done', steps: { details: 'done', lookup: 'done', profile: 'done', competitors: 'done', invite: 'done', billing: 'todo' } });
    render(await run());
    expect(props().current).toBe('billing');
    expect(props().billing).toEqual({ ready: true, priceCents: 34900, setupFeeCents: null });
  });

  it('a finished setup shows the confirmation with the summary rows', async () => {
    m.state = open({ open: false, completedAt: new Date().toISOString(), competitors: 'done', steps: { details: 'done', lookup: 'done', profile: 'done', competitors: 'done', invite: 'done', billing: 'done' } });
    m.invite = { status: 'pending', name: 'Maria Alvarez', email: 'maria@x.com' };
    m.suggestions = [{ id: 'a', status: 'accepted' }, { id: 'b', status: 'accepted' }, { id: 'c', status: 'dismissed' }];
    render(await run({ step: 'profile' }));
    expect(props().current).toBe('done');
    expect(props().summary).toEqual({
      business: 'Cool Breeze', contact: 'Maria Alvarez · (512) 555-0187', area: '2 keywords · 10 mi around Round Rock', competitors: '2 picked', competitorsWaiting: false,
      owner: 'Invite sent to Maria', billing: '$349/month · payment link sent',
    });
  });

  it('asked-the-owner reads as waiting on them by first name', async () => {
    m.state = open({ open: false, competitors: 'waiting_owner', steps: { details: 'done', lookup: 'done', profile: 'done', competitors: 'waiting_owner', invite: 'done', billing: 'skipped' } });
    m.invite = { status: 'pending', name: 'Maria Alvarez', email: 'maria@x.com' };
    render(await run());
    expect(props().summary).toMatchObject({ competitorsWaiting: true, competitors: 'Waiting on Maria to pick competitors', billing: 'Not turned on' });
  });

  it('a dismissed setup says so, with links on to settings', async () => {
    m.state = open({ open: false, dismissedAt: new Date().toISOString() });
    render(await run());
    expect(screen.getByRole('heading', { name: 'Setup dismissed' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'settings' }).getAttribute('href')).toBe(`/c/${C}/settings/profile`);
    expect(screen.queryByTestId('wizard')).toBeNull();
  });

  it('owners never see it: they go to their Overview (Phase 16 P8)', async () => {
    m.role = 'client_owner';
    await expect(run()).rejects.toThrow(`NEXT_REDIRECT:/c/${C}`);
    expect(m.calls).toEqual([]);
  });
});
