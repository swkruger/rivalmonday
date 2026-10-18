// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/server/db', () => ({ dbs: () => ({ service: 'svc' }) }));
vi.mock('@/server/branding', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/server/branding')>()),
  defaultBranding: async () => ({ displayName: 'Rival Monday', logoUrl: null }),
  authBranding: async () => null,
}));
vi.mock('@/server/env', () => ({ webEnv: () => ({}) }));
vi.mock('@/components/auth-card', () => ({ AuthCard: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }));
const { default: Page } = await import('./page');

afterEach(cleanup);
describe('check-email', () => {
  it('for=signup shows the sign-up copy', async () => {
    render(await Page({ searchParams: Promise.resolve({ for: 'signup' }) }));
    expect(screen.getByText("Check your inbox. If you can create an agency with this address, we've sent a link to confirm it. The link works for 15 minutes.")).toBeTruthy();
  });
  it('otherwise keeps the sign-in copy', async () => {
    render(await Page({ searchParams: Promise.resolve({}) }));
    expect(screen.getByText(/If this address has access, a sign-in link is on its way/)).toBeTruthy();
  });
});
