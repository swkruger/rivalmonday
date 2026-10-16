// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ target: vi.fn(), unsubscribe: vi.fn() }));
vi.mock('@/server/unsubscribe', () => ({ unsubscribeTarget: (...a: unknown[]) => m.target(...a), unsubscribeFromTips: (...a: unknown[]) => m.unsubscribe(...a) }));
vi.mock('@/server/db', () => ({ dbs: () => ({ service: 'svc' }) }));
vi.mock('@/server/env', () => ({ webEnv: () => ({ appUrl: 'http://localhost:3000', authSecret: 's' }) }));
vi.mock('@/server/branding', () => ({ defaultBranding: async () => ({ displayName: 'Rival Monday', logoUrl: null }) }));
vi.mock('@/components/auth-card', () => ({
  AuthCard: ({ title, children }: { title: string; children: React.ReactNode }) => (
    <main>
      <h1>{title}</h1>
      {children}
    </main>
  ),
}));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));
const { default: ConfirmPage } = await import('./confirm/page');
const { default: DonePage } = await import('./done/page');
const params = (token = 'tok') => ({ params: Promise.resolve({ token }) });

afterEach(cleanup);
beforeEach(() => {
  m.target.mockReset().mockResolvedValue({ agencyId: 'ag-1', agencyName: 'Acme Agency' });
  m.unsubscribe.mockReset();
});

describe('/u/[token]/confirm', () => {
  it('asks to stop tips for the agency with an Unsubscribe button posting to /u/<token>; changes nothing', async () => {
    const { container } = render(await ConfirmPage(params('tok')));
    expect(screen.getByText('Stop setup tips for Acme Agency?')).toBeTruthy();
    const form = screen.getByRole('button', { name: 'Unsubscribe' }).closest('form')!;
    expect(form.getAttribute('method')).toBe('post');
    expect(form.getAttribute('action')).toBe('/u/tok');
    expect(container.textContent).not.toContain("You won't get setup tips any more.");
    expect(m.unsubscribe).not.toHaveBeenCalled();
    expect(m.target).toHaveBeenCalledWith('svc', 'tok', 's');
  });

  it('a bad token is a 404', async () => {
    m.target.mockResolvedValue(null);
    await expect(ConfirmPage(params())).rejects.toThrow('NEXT_NOT_FOUND');
  });
});

describe('/u/[token]/done', () => {
  it('confirms the unsubscribe without writing anything', async () => {
    render(await DonePage(params('tok')));
    expect(screen.getByText("You won't get setup tips any more.")).toBeTruthy();
    expect(m.unsubscribe).not.toHaveBeenCalled();
  });

  it('a bad token is a 404', async () => {
    m.target.mockResolvedValue(null);
    await expect(DonePage(params())).rejects.toThrow('NEXT_NOT_FOUND');
  });
});
