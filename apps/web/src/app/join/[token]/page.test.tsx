// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ check: vi.fn(), discount: vi.fn() }));
vi.mock('@cs/tools', () => ({ checkInviteLink: (...a: unknown[]) => m.check(...a) }));
vi.mock('@/server/db', () => ({ dbs: () => ({ service: 'svc' }) }));
vi.mock('@/server/branding', () => ({ defaultBranding: async () => ({ displayName: 'Rival Monday', logoUrl: null }) }));
vi.mock('@/server/dev-guard', () => ({ activeEnvName: () => 'test' }));
vi.mock('@/server/env', () => ({ webEnv: () => ({ google: null, turnstile: {} }) }));
vi.mock('@/components/auth-card', () => ({
  AuthCard: ({ title, children }: { title: string; children: React.ReactNode }) => (
    <main>
      <h1>{title}</h1>
      {children}
    </main>
  ),
}));
vi.mock('../../sign-up/sign-up-form', () => ({
  SignUpForm: (p: { inviteToken: string; lockedEmail: string | null }) => <div data-testid="form" data-token={p.inviteToken} data-locked={p.lockedEmail ?? ''} />,
}));
vi.mock('./offer', async (orig) => ({ ...(await orig<typeof import('./offer')>()), discountText: (...a: unknown[]) => m.discount(...a) }));
const { default: JoinPage } = await import('./page');

const show = async (token = 'rm_inv_abc') => render(await JoinPage({ params: Promise.resolve({ token }) }));
afterEach(cleanup);
beforeEach(() => {
  m.check.mockReset();
  m.discount.mockReset().mockResolvedValue(null);
});

describe('/join/[token]', () => {
  it.each(['link_unknown', 'link_revoked', 'link_expired', 'link_used_up'])('%s shows the invalid-link copy and no form', async (problem) => {
    m.check.mockResolvedValue({ ok: false, problem });
    await show();
    expect(screen.getByText('This invite link is no longer valid. Ask the person who sent it for a new one.')).toBeTruthy();
    expect(screen.queryByTestId('form')).toBeNull();
  });

  it('checks the link without an email (page-load check)', async () => {
    m.check.mockResolvedValue({ ok: false, problem: 'link_unknown' });
    await show('rm_inv_zzz');
    expect(m.check).toHaveBeenCalledWith('svc', 'rm_inv_zzz', null, expect.any(Date));
  });

  it('a pilot link shows the pilot banner with its end date; the form gets the token and the locked email', async () => {
    m.check.mockResolvedValue({ ok: true, link: { offer: 'pilot', pilotEndsAt: new Date('2026-12-31T00:00:00Z'), emailLock: 'pat@acme.com', discountCodeId: null } });
    await show();
    expect(screen.getByText("You're invited to the Rival Monday pilot until December 31, 2026.")).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Join the Rival Monday pilot');
    const form = screen.getByTestId('form');
    expect(form.getAttribute('data-token')).toBe('rm_inv_abc');
    expect(form.getAttribute('data-locked')).toBe('pat@acme.com');
  });

  it('a trial link shows the trial banner, with the discount when there is one', async () => {
    m.check.mockResolvedValue({ ok: true, link: { offer: 'trial', pilotEndsAt: null, emailLock: null, discountCodeId: 'd1' } });
    await show();
    expect(screen.getByText("You're invited to a 30-day Rival Monday trial.")).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Start your Rival Monday trial');
    cleanup();
    m.discount.mockResolvedValue('20% off');
    await show();
    expect(screen.getByText("You're invited to a 30-day Rival Monday trial with 20% off.")).toBeTruthy();
    expect(screen.getByTestId('form').getAttribute('data-locked')).toBe('');
  });
});
