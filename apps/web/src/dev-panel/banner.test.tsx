// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
const { DevBanner } = await import('./banner');

afterEach(() => vi.unstubAllGlobals());
const okJson = (body: unknown) => Promise.resolve({ ok: true, json: async () => body });

describe('DevBanner (spec 5.1)', () => {
  it.each([
    ['dev', 'DEV · real data'],
    ['demo', 'DEMO'],
    ['test', 'TEST · wiped by test runs'],
  ] as const)('labels %s', (env, label) => {
    render(<DevBanner env={env} />);
    const strip = screen.getByRole('button', { name: /open the dev panel/i });
    expect(strip.textContent).toBe(label);
    expect(strip.getAttribute('data-rm-dev-panel')).toBe(env);
  });

  it('offers reset only in DEMO and disables it while a reset is running', async () => {
    vi.stubGlobal('fetch', vi.fn((url: string) => (url === '/dev-panel/api/links' ? okJson({ links: [] }) : new Promise(() => {}))));
    render(<DevBanner env="demo" />);
    fireEvent.click(screen.getByRole('button', { name: /open the dev panel/i }));
    const reset = (await screen.findByRole('button', { name: 'Reset demo data' })) as HTMLButtonElement;
    expect(reset.disabled).toBe(false);
    fireEvent.click(reset);
    await waitFor(() => expect(reset.disabled).toBe(true));
    expect(screen.queryByRole('button', { name: 'Take snapshot' })).toBeNull();
  });

  it('offers a snapshot in DEV and no reset', async () => {
    vi.stubGlobal('fetch', vi.fn(() => okJson({ links: [{ label: 'Sign-in page', url: '/sign-in' }] })));
    render(<DevBanner env="dev" />);
    fireEvent.click(screen.getByRole('button', { name: /open the dev panel/i }));
    expect(await screen.findByRole('button', { name: 'Take snapshot' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Reset demo data' })).toBeNull();
    expect(await screen.findByRole('link', { name: 'Sign-in page' })).toBeTruthy();
  });
});
