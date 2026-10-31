// @vitest-environment jsdom
import { createAccessContext } from '@cs/core';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HelpProvider } from '@/components/help/help-provider';

const A = '11111111-1111-4111-8111-111111111111';
const m = vi.hoisted(() => ({ kind: 'user' as string, calls: [] as string[] }));
const SETTING = {
  contactId: 'k1', agencyName: 'Cool Comfort', clientName: null, email: 'a@b.co', timezone: null, quietHours: null,
  kinds: [{ kind: 'am_alert', channels: { in_app: true, email: true } }],
};

vi.mock('@/server/current-viewer', () => ({
  requireContext: async () => ({ viewer: { kind: m.kind, userId: 'u' }, ctx: createAccessContext({ agencyId: A, userId: 'u', role: 'agency_admin', clientScope: 'all', features: ['dashboard'] as never }) }),
}));
vi.mock('@/server/db', () => ({ dbs: () => ({ service: {} }) }));
vi.mock('@/server/timezones', () => ({ timezoneOptions: () => ['UTC'] }));
const tool = async (_ctx: unknown, name: string) => {
  m.calls.push(name);
  switch (name) {
    case 'get_my_profile': return { name: 'Pat Doe', email: 'pat@example.com', avatarUrl: null };
    case 'get_my_notification_settings': return { lists: [SETTING] };
    case 'list_help_guides': return { guides: [] };
    default: throw new Error(`unmocked tool ${name}`);
  }
};
vi.mock('@/server/tools', () => ({ callTool: tool, tryCallTool: tool }));
vi.mock('@/app/(app)/kb/actions', () => ({ loadPageGuide: vi.fn() }));
vi.mock('./actions', () => ({ updateNameAction: vi.fn(), removeAvatarAction: vi.fn() }));
vi.mock('../notifications/actions', () => ({ setPrefAction: vi.fn(), updateContactAction: vi.fn() }));
vi.mock('next/navigation', () => ({
  notFound: () => { throw new Error('NEXT_NOT_FOUND'); }, redirect: (to: string) => { throw new Error(`NEXT_REDIRECT:${to}`); },
  usePathname: () => '/settings/profile', useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

const { default: Profile, metadata } = await import('./page');
const { default: OldNotifications } = await import('../notifications/page');

beforeEach(() => { m.kind = 'user'; m.calls = []; });
afterEach(cleanup);

describe('/settings/profile', () => {
  it('renders the name, the read-only email, the photo controls and the notification list', async () => {
    render(<HelpProvider value={{ audience: 'agency', names: { agency: 'Cool Comfort', assistant: 'Sunny' } }}>{await Profile()}</HelpProvider>);
    expect(metadata.title).toBe('Profile');
    expect(screen.getByRole('heading', { level: 1, name: 'Profile' })).toBeTruthy();
    expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('Pat Doe');
    expect((screen.getByLabelText('Email') as HTMLInputElement).readOnly).toBe(true);
    expect(screen.getByRole('button', { name: 'Upload photo' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Cool Comfort' })).toBeTruthy();
    expect(screen.getByRole('switch', { name: /in-app/i })).toBeTruthy();
    expect(document.getElementById('notifications')).toBeTruthy();
    expect(m.calls).toEqual(expect.arrayContaining(['get_my_profile', 'get_my_notification_settings']));
  });

  it.each(['guest', 'support'])('is a 404 for a %s viewer', async (kind) => {
    m.kind = kind;
    await expect(Profile()).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('the old notifications URL redirects to the Notifications section', () => {
    expect(() => OldNotifications()).toThrow('NEXT_REDIRECT:/settings/profile#notifications');
  });
});
