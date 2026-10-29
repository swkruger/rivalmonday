// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ paused: false, pilot: false }));
vi.mock('@cs/tools', () => ({ signupsPaused: async () => m.paused, pilotMode: async () => m.pilot }));
vi.mock('@/server/db', () => ({ dbs: () => ({ service: {} }) }));
vi.mock('@/server/branding', () => ({ defaultBranding: async () => ({ name: 'Rival Monday', logoUrl: null }) }));
vi.mock('@/server/dev-guard', () => ({ activeEnvName: () => 'test' }));
vi.mock('@/server/env', () => ({ webEnv: () => ({ google: null, turnstile: undefined, siteOrigins: ['https://rivalmonday.com'] }) }));
vi.mock('@/components/auth-card', () => ({ AuthCard: ({ title, children }: { title: string; children: React.ReactNode }) => <div><h1>{title}</h1>{children}</div> }));
vi.mock('./sign-up-form', () => ({ SignUpForm: () => <div>sign-up-form</div> }));
const { default: Page } = await import('./page');

beforeEach(() => { m.paused = false; m.pilot = false; });
afterEach(cleanup);

describe('/sign-up', () => {
  it('shows the form when sign-ups are open', async () => {
    render(await Page({ searchParams: Promise.resolve({}) }));
    expect(screen.getByText('sign-up-form')).toBeTruthy();
  });

  it('sign-up links to sign in and to the privacy policy', async () => {
    render(await Page({ searchParams: Promise.resolve({}) }));
    expect(screen.getByRole('link', { name: /Sign in/ }).getAttribute('href')).toBe('/sign-in');
    expect(screen.getByRole('link', { name: 'privacy policy' }).getAttribute('href')).toBe('https://rivalmonday.app/privacy');
  });

  it('shows the paused copy instead of the form when paused', async () => {
    m.paused = true;
    render(await Page({ searchParams: Promise.resolve({}) }));
    expect(screen.getByText("New sign-ups are paused right now. Contact support@rivalmonday.app and we'll get you set up.")).toBeTruthy();
    expect(screen.queryByText('sign-up-form')).toBeNull();
  });

  it('pilot on shows the pilot message and the join link', async () => {
    m.pilot = true;
    render(await Page({ searchParams: Promise.resolve({}) }));
    expect(screen.getByRole('heading', { name: 'Rival Monday is in pilot' })).toBeTruthy();
    expect(screen.getByText("We're opening places to agencies a few at a time. Join the waitlist and we'll email you an invite when yours is ready.")).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Join the waitlist' }).getAttribute('href')).toBe('https://rivalmonday.com/#join');
    expect(screen.getByText('Already have an invite? Open the link in your invite email.')).toBeTruthy();
    expect(screen.getByRole('link', { name: /Sign in/ }).getAttribute('href')).toBe('/sign-in');
    expect(screen.queryByText('sign-up-form')).toBeNull();
  });

  it('pilot and paused both on shows the pilot message', async () => {
    m.pilot = true;
    m.paused = true;
    render(await Page({ searchParams: Promise.resolve({}) }));
    expect(screen.getByRole('heading', { name: 'Rival Monday is in pilot' })).toBeTruthy();
    expect(screen.queryByText(/paused right now/)).toBeNull();
  });
});
