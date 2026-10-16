// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ paused: false }));
vi.mock('@cs/tools', () => ({ signupsPaused: async () => m.paused }));
vi.mock('@/server/db', () => ({ dbs: () => ({ service: {} }) }));
vi.mock('@/server/branding', () => ({ defaultBranding: async () => ({ name: 'Rival Monday', logoUrl: null }) }));
vi.mock('@/server/dev-guard', () => ({ activeEnvName: () => 'test' }));
vi.mock('@/server/env', () => ({ webEnv: () => ({ google: null, turnstile: undefined }) }));
vi.mock('@/components/auth-card', () => ({ AuthCard: ({ title, children }: { title: string; children: React.ReactNode }) => <div><h1>{title}</h1>{children}</div> }));
vi.mock('./sign-up-form', () => ({ SignUpForm: () => <div>sign-up-form</div> }));
const { default: Page } = await import('./page');

beforeEach(() => { m.paused = false; });
afterEach(cleanup);

describe('/sign-up', () => {
  it('shows the form when sign-ups are open', async () => {
    render(await Page({ searchParams: Promise.resolve({}) }));
    expect(screen.getByText('sign-up-form')).toBeTruthy();
  });

  it('shows the paused copy instead of the form when paused', async () => {
    m.paused = true;
    render(await Page({ searchParams: Promise.resolve({}) }));
    expect(screen.getByText("New sign-ups are paused right now. Contact support@rivalmonday.app and we'll get you set up.")).toBeTruthy();
    expect(screen.queryByText('sign-up-form')).toBeNull();
  });
});
