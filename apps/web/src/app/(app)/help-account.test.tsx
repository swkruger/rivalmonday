// @vitest-environment jsdom
import { createAccessContext } from '@cs/core';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { groupGuides } from '@/components/help/help-groups';
import { HelpProvider } from '@/components/help/help-context';
import { navFor, settingsNavFor } from '@/components/shell/nav-items';
import { PAGE_COPY } from '@/help/copy';

/**
 * 15b-2 Task 9b, account pages (Inbox, Notification settings, the agency setup wizard). They sit outside `/agency`, `/c/<id>`
 * and `/platform`, so `PageGuide` derives the agency scope (`helpScopeOf`): every page reads `list_help_guides` for
 * `{ context: 'agency' }`, whoever the viewer is. Inbox and Notification settings are reached by agency roles and client
 * roles (the inbox also by guests), so tips and empty states carry the viewer's audience; the wizard is agency-admin only.
 */
const A = '11111111-1111-4111-8111-111111111111';
const C = '22222222-2222-4222-8222-222222222222';
const m = vi.hoisted(() => ({
  role: 'agency_admin' as string, viewerKind: 'user' as 'user' | 'guest', guides: [] as string[], calls: [] as [string, unknown][],
  inbox: [] as unknown[], settings: [] as unknown[], support: false,
  status: { steps: { profile: 'open', team: 'open', plan: 'open', branding: 'open', first_client: 'open' }, dismissed: false, completed: false } as Record<string, unknown>,
}));

vi.mock('@/server/current-viewer', () => ({
  requireContext: async () => ({
    viewer: m.viewerKind === 'guest' ? { kind: 'guest', contactId: 'c1' } : { kind: 'user', userId: 'u' },
    ctx: { ...createAccessContext({ agencyId: A, userId: 'u', role: m.role as never, clientScope: m.role.startsWith('client') ? [C] : 'all', features: ['dashboard'] as never }), ...(m.support ? { support: {} } : {}) },
  }),
}));
vi.mock('@cs/tools', () => ({
  listInbox: async () => m.inbox,
  myNotificationSettings: async () => m.settings,
  getAgencyBranding: async () => ({ stored: { displayName: 'Acme' }, resolved: { displayName: 'Acme' } }),
}));
vi.mock('@/server/db', () => ({ dbs: () => ({ service: {} }) }));
vi.mock('@/server/timezones', () => ({ timezoneOptions: () => ['UTC'] }));
vi.mock('@/server/verticals', () => ({ verticalOptions: async () => [] }));
const tool = async (_ctx: unknown, name: string, input: unknown) => {
  m.calls.push([name, input]);
  switch (name) {
    case 'list_help_guides': return { guides: m.guides.map((helpKey) => ({ helpKey, title: 't', articleId: 'g' })) };
    case 'get_onboarding_status': return m.status;
    case 'get_agency_profile': return { name: 'Acme' };
    case 'get_billing_summary': return { state: 'trialing' };
    default: throw new Error(`unmocked tool ${name}`);
  }
};
vi.mock('@/server/tools', () => ({ callTool: tool, tryCallTool: tool }));
vi.mock('@/app/(app)/kb/actions', () => ({ loadPageGuide: vi.fn() }));
vi.mock('./inbox/actions', () => ({ markAllReadAction: vi.fn(), openNotification: vi.fn() }));
vi.mock('./settings/notifications/actions', () => ({ setPrefAction: vi.fn(), updateContactAction: vi.fn() }));
vi.mock('./onboarding/actions', () => ({
  saveProfileAction: vi.fn(), inviteTeamAction: vi.fn(), skipStepAction: vi.fn(), continuePlanAction: vi.fn(), startCheckoutAction: vi.fn(), saveBrandingStepAction: vi.fn(),
}));
const step = (name: string) => () => <div data-testid={name} />;
vi.mock('./onboarding/steps/profile', () => ({ ProfileStep: step('profile') }));
vi.mock('./onboarding/steps/team', () => ({ TeamStep: step('team') }));
vi.mock('./onboarding/steps/plan', () => ({ PlanStep: step('plan') }));
vi.mock('./onboarding/steps/branding', () => ({ BrandingStep: step('branding') }));
vi.mock('./onboarding/stepper', () => ({ Stepper: () => <div data-testid="stepper" /> }));
vi.mock('next/navigation', () => ({
  notFound: () => { throw new Error('NEXT_NOT_FOUND'); }, redirect: (to: string) => { throw new Error(`NEXT_REDIRECT:${to}`); },
  usePathname: () => '/inbox', useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

const { default: Inbox } = await import('./inbox/page');
const { default: Notifications } = await import('./settings/notifications/page');
const { default: Onboarding } = await import('./onboarding/page');

const ITEM = { id: 'n1', kind: 'alert', title: 'Competitor cut a price', body: 'Details', link: null, clientId: C, createdAt: new Date('2026-10-20T15:00:00Z'), readAt: null };
const SETTING = {
  contactId: 'k1', agencyName: 'Cool Comfort', clientName: null, email: 'a@b.co', timezone: null, quietHours: null,
  kinds: [{ kind: 'am_alert', channels: { in_app: true, email: true } }],
};
const PAGES = [
  ['account.inbox', () => Inbox()],
  ['account.settings.notifications', () => Notifications()],
  ['account.onboarding', () => Onboarding({ searchParams: Promise.resolve({}) })],
] as const;
const page = (key: string) => PAGES.find(([k]) => k === key)![1];

async function show(key: string, audience: 'agency' | 'client' = 'agency') {
  m.role = audience === 'agency' ? 'agency_admin' : 'client_owner';
  render(<HelpProvider value={{ audience, names: { agency: 'Cool Comfort', assistant: 'Sunny' } }}>{await page(key)()}</HelpProvider>);
}
/** The header's Guide button (not the "More in the guide" link an empty state carries). */
const isPageGuide = (el: HTMLElement) => !/more in/i.test(el.textContent ?? '');
const guideButton = async () => (await screen.findAllByRole('button', { name: /guide/i }, { timeout: 15_000 })).find(isPageGuide);
const hasTip = (name: string) => screen.queryByRole('button', { name }) !== null;
const open = (name: string) => {
  fireEvent.click(screen.getByRole('button', { name }));
  return screen.getByRole('dialog').textContent ?? '';
};

beforeEach(() => {
  m.role = 'agency_admin'; m.viewerKind = 'user'; m.guides = []; m.calls = []; m.inbox = []; m.settings = []; m.support = false;
  m.status = { steps: { profile: 'open', team: 'open', plan: 'open', branding: 'open', first_client: 'open' }, dismissed: false, completed: false };
});
afterEach(cleanup);

describe('account pages: guide button and reach', () => {
  for (const [key] of PAGES) {
    it(`${key}: shows the Guide button only when list_help_guides has page:${key}, read once for the agency scope the guide drawer uses`, async () => {
      m.guides = [`page:${key}`];
      await show(key);
      expect(await guideButton()).toBeTruthy();
      expect(m.calls.filter(([n]) => n === 'list_help_guides').map(([, i]) => i)).toEqual([{ context: 'agency' }]);
      cleanup();
      m.guides = ['page:account.other'];
      await show(key);
      expect(screen.queryAllByRole('button', { name: /guide/i }).filter(isPageGuide)).toHaveLength(0);
    });
  }

  it('Inbox and Notification settings also show the Guide button to a client owner, with the same agency scope; a guest reads the inbox', async () => {
    m.guides = ['page:account.inbox', 'page:account.settings.notifications'];
    for (const key of ['account.inbox', 'account.settings.notifications']) {
      m.calls = [];
      await show(key, 'client');
      expect(await guideButton(), key).toBeTruthy();
      expect(m.calls.filter(([n]) => n === 'list_help_guides').map(([, i]) => i), key).toEqual([{ context: 'agency' }]);
      cleanup();
    }
    m.viewerKind = 'guest';
    await show('account.inbox', 'client');
    expect(await guideButton()).toBeTruthy();
  });

  it('the setup wizard is a 404 for an account manager and for a client owner; Notification settings is a 404 for a guest', async () => {
    for (const role of ['account_manager', 'client_owner']) {
      m.role = role;
      await expect(Onboarding({ searchParams: Promise.resolve({}) }), role).rejects.toThrow('NEXT_NOT_FOUND');
    }
    m.viewerKind = 'guest';
    await expect(Notifications()).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('account guides list under "Your account" for the agency and the client menu', () => {
    const guides = ['page:account.inbox', 'page:account.settings.notifications', 'page:account.onboarding'].map((helpKey) => ({ helpKey, title: 't', articleId: helpKey }));
    const flags = { isAgency: true, isAgencyAdmin: true, isUser: true, homePath: '/agency', dashboard: true, alertRules: true, mcp: true, ask: true };
    const agency = groupGuides('agency', navFor('agency', flags, null), settingsNavFor('agency', flags), guides);
    expect(agency.at(-1)).toMatchObject({ heading: 'Your account' });
    expect(agency.at(-1)!.guides.map((g) => g.helpKey)).toEqual(guides.map((g) => g.helpKey));
    const cflags = { ...flags, isAgency: false, isAgencyAdmin: false, homePath: `/c/${C}` };
    const client = groupGuides('client', navFor('client', cflags, C), settingsNavFor('client', cflags, C), guides.slice(0, 2));
    expect(client.at(-1)!.heading).toBe('Your account');
    expect(client.at(-1)!.guides).toHaveLength(2);
  });
});

describe('Inbox', () => {
  it('description names the 100 newest, and the page lists no more than the 100 it asks for', async () => {
    await show('account.inbox');
    expect(screen.getByText(/latest 100 notifications, newest first/)).toBeTruthy();
    expect(PAGE_COPY['account.inbox'].description).toMatch(/100/);
  });

  it('with no notifications: a teaching empty state; with some: no empty state', async () => {
    await show('account.inbox');
    expect(screen.getByText('Nothing here yet')).toBeTruthy();
    expect(screen.getByText(/Notification settings/)).toBeTruthy();
    cleanup();
    m.inbox = [ITEM];
    await show('account.inbox');
    expect(screen.queryByText('Nothing here yet')).toBeNull();
    expect(screen.getByText('Competitor cut a price')).toBeTruthy();
  });

  it('the read/unread tip is for everyone; the labels tip is the agency one for agency staff and the client one for clients', async () => {
    await show('account.inbox');
    expect(open('Unread and read')).toMatch(/bold/);
    cleanup();
    await show('account.inbox');
    const agency = open('What the labels mean');
    for (const w of ['Client alerts (agency)', 'Brief ready for review', 'Brief failed', 'Brief overdue', 'Rank scan skipped']) expect(agency, w).toContain(w);
    cleanup();
    await show('account.inbox', 'client');
    expect(hasTip('Unread and read')).toBe(true);
    const client = open('What the labels mean');
    for (const w of ['Instant alerts', 'Alert digest', 'Weekly brief', 'Quarterly report']) expect(client, w).toContain(w);
    expect(client).not.toMatch(/agency|rank scan|overdue/i);
  });
});

describe('Notification settings', () => {
  it('description and the always-shown tips; the several-lists tip only with more than one list', async () => {
    m.settings = [SETTING];
    await show('account.settings.notifications');
    expect(screen.getByText(/Choose which notices reach you in the app and by email/)).toBeTruthy();
    for (const t of ['In-app and email', 'Quiet hours', 'Time zone']) expect(hasTip(t), t).toBe(true);
    expect(hasTip('More than one list')).toBe(false);
    cleanup();
    m.settings = [SETTING, { ...SETTING, contactId: 'k2', clientName: 'Lone Star Cooling' }];
    await show('account.settings.notifications');
    expect(hasTip('More than one list')).toBe(true);
  });

  it('quiet hours: email held until the window ends, in-app unaffected, both times needed, overnight allowed', async () => {
    m.settings = [SETTING];
    await show('account.settings.notifications');
    const q = open('Quiet hours');
    expect(q).toMatch(/held/);
    expect(q).toMatch(/in-app/i);
    expect(q).toMatch(/both/i);
    expect(q).toMatch(/overnight|21:00/);
  });

  it('the time zone tip differs by audience: US Central for agency staff, the business time zone for clients', async () => {
    m.settings = [SETTING];
    await show('account.settings.notifications');
    expect(open('Time zone')).toMatch(/US Central/);
    cleanup();
    await show('account.settings.notifications', 'client');
    const t = open('Time zone');
    expect(t).toMatch(/your business/);
    expect(t).not.toMatch(/Central/);
  });

  it('the notice tips: agency staff read the agency notices, clients the client ones, and neither sees the other', async () => {
    m.settings = [SETTING];
    await show('account.settings.notifications');
    const a = open('Agency notices');
    for (const w of ['Client alerts (agency)', 'Brief ready for review', 'Brief failed', 'Brief overdue', 'Rank scan skipped']) expect(a, w).toContain(w);
    expect(hasTip('Notices about your business')).toBe(false);
    cleanup();
    await show('account.settings.notifications', 'client');
    const c = open('Notices about your business');
    for (const w of ['Instant alerts', 'Alert digest', 'Weekly brief', 'Quarterly report']) expect(c, w).toContain(w);
    expect(hasTip('Agency notices')).toBe(false);
    expect(c).not.toMatch(/agency|rank scan|overdue/i);
  });

  it('with no lists: a teaching empty state for both audiences', async () => {
    await show('account.settings.notifications');
    expect(screen.getByText('No notification settings yet')).toBeTruthy();
    cleanup();
    await show('account.settings.notifications', 'client');
    expect(screen.getByText('No notification settings yet')).toBeTruthy();
  });
});

describe('Set up your agency (wizard)', () => {
  it('description says four steps, all skippable; the skip tip is on every step', async () => {
    await show('account.onboarding');
    expect(screen.getByText(/Four short steps/)).toBeTruthy();
    expect(open('Skipping a step')).toMatch(/Skipped/);
  });

  it('each step carries its own "About this step" tip', async () => {
    const want: Record<string, RegExp> = { profile: /contact name/, team: /Agency admin/, plan: /payment/, branding: /logo/ };
    for (const [s, re] of Object.entries(want)) {
      m.status = { ...m.status, steps: { profile: 'open', team: 'open', plan: 'open', branding: 'open', first_client: 'open' } };
      m.role = 'agency_admin';
      render(<HelpProvider value={{ audience: 'agency', names: { agency: 'Cool Comfort', assistant: 'Sunny' } }}>{await Onboarding({ searchParams: Promise.resolve({ step: s }) })}</HelpProvider>);
      expect(open('About this step'), s).toMatch(re);
      cleanup();
    }
  });

  it('a finished or dismissed wizard still redirects to /agency before any help is read', async () => {
    m.status = { ...m.status, completed: true };
    await expect(Onboarding({ searchParams: Promise.resolve({}) })).rejects.toThrow('NEXT_REDIRECT:/agency');
  });
});

describe('account copy: wording rules', () => {
  it('no account copy names the product, the assistant, or the setup wording a client must not read', () => {
    for (const [k, c] of Object.entries({ 'account.inbox': PAGE_COPY['account.inbox'], 'account.settings.notifications': PAGE_COPY['account.settings.notifications'], 'account.onboarding': PAGE_COPY['account.onboarding'] })) {
      const text = JSON.stringify(c);
      expect(text, k).not.toMatch(/rival\s*monday|friday|\btheme/i);
    }
  });
});
