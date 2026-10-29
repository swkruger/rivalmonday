// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/server/db', () => ({ dbs: () => ({ service: 'svc' }) }));
vi.mock('@/server/branding', () => ({ defaultBranding: async () => ({ displayName: 'Rival Monday', logoUrl: null }) }));
vi.mock('@/server/env', () => ({ webEnv: () => ({ siteOrigins: ['https://rivalmonday.com'] }) }));
vi.mock('@/components/auth-card', () => ({
  AuthCard: ({ title, children }: { title: string; children: React.ReactNode }) => (
    <main>
      <h1>{title}</h1>
      {children}
    </main>
  ),
}));
const { default: Page, metadata } = await import('./page');
afterEach(cleanup);

describe('/waitlist/confirmed', () => {
  it('confirmed copy, noindex', async () => {
    render(await Page({ searchParams: Promise.resolve({}) }));
    expect(screen.getByRole('heading').textContent).toBe("You're confirmed");
    expect(screen.getByText(/your place on the list is saved/)).toBeTruthy();
    expect(metadata.robots).toEqual({ index: false });
  });

  it('?expired=1 shows the expired copy with a link to the join form', async () => {
    render(await Page({ searchParams: Promise.resolve({ expired: '1' }) }));
    expect(screen.getByRole('heading').textContent).toBe('This link has expired');
    expect(screen.getByRole('link', { name: 'rivalmonday.com' }).getAttribute('href')).toBe('https://rivalmonday.com/#join');
  });
});
