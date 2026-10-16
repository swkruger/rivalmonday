// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ viewer: null as unknown, pending: vi.fn(), problem: vi.fn() }));
class Redirect extends Error {
  constructor(public to: string) {
    super(to);
  }
}
vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new Redirect(to);
  },
}));
vi.mock('@cs/tools', () => ({ inviteProblemForLink: (...a: unknown[]) => m.problem(...a) }));
vi.mock('@/server/current-viewer', () => ({ getViewer: async () => m.viewer }));
vi.mock('@/server/db', () => ({ dbs: () => ({ service: 'svc' }) }));
vi.mock('@/server/branding', () => ({ defaultBranding: async () => ({ displayName: 'Rival Monday', logoUrl: null }) }));
vi.mock('@/server/env', () => ({ webEnv: () => ({}) }));
vi.mock('@/server/pending-signup', () => ({ openPendingSignup: (...a: unknown[]) => m.pending(...a) }));
vi.mock('@/components/auth-card', () => ({ AuthCard: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }));
const { default: Page } = await import('./page');

afterEach(cleanup);
beforeEach(() => {
  m.viewer = { kind: 'member-less', userId: 'u', email: 'pat@acme.com', name: '' };
  m.pending.mockReset().mockResolvedValue({ id: 'p', agencyName: 'Acme', inviteLinkId: 'l1' });
  m.problem.mockReset().mockResolvedValue(null);
});
const to = async () => Page().then(() => null, (e: Redirect) => e.to);

describe('/sign-up/problem', () => {
  it.each([
    ['email_lock_mismatch', 'This invite is for a different email address. Sign in with that address or ask Rival Monday for a new link.'],
    ['link_used_up', 'This invite link has already been used.'],
    ['link_revoked', 'This invite link is no longer valid.'],
    ['link_expired', 'This invite link is no longer valid.'],
  ])('%s shows its copy and a Back to sign-up button', async (problem, copy) => {
    m.problem.mockResolvedValue(problem);
    render(await Page());
    expect(screen.getByText(copy)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Back to sign-up' }).getAttribute('href')).toBe('/sign-up');
    expect(m.problem).toHaveBeenCalledWith('svc', 'l1', 'pat@acme.com', expect.any(Date));
  });

  it('no pending row, no link or no problem shows the generic copy', async () => {
    const generic = "We couldn't finish creating your agency. Contact support@rivalmonday.app.";
    m.pending.mockResolvedValue(null);
    render(await Page());
    expect(screen.getByText(generic)).toBeTruthy();
    cleanup();
    m.pending.mockResolvedValue({ id: 'p', agencyName: 'Acme', inviteLinkId: null });
    render(await Page());
    expect(screen.getByText(generic)).toBeTruthy();
    cleanup();
    m.pending.mockResolvedValue({ id: 'p', agencyName: 'Acme', inviteLinkId: 'l1' });
    m.problem.mockResolvedValue('link_unknown');
    render(await Page());
    expect(screen.getByText(generic)).toBeTruthy();
  });

  it('signed out goes to /sign-in; a user with a membership goes to /agency', async () => {
    m.viewer = null;
    expect(await to()).toBe('/sign-in');
    m.viewer = { kind: 'user', email: 'x@y.co' };
    expect(await to()).toBe('/agency');
  });
});
