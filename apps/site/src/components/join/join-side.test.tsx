import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/env', () => ({ siteEnv: { appUrl: 'https://app.test', clientPriceUsd: 99, social: {}, turnstileSiteKey: null as string | null } }));
vi.mock('../../lib/site-status', async (orig) => ({ ...(await orig<typeof import('../../lib/site-status')>()), fetchSiteStatus: async () => null }));
const nav = vi.hoisted(() => ({ pathname: '/' }));
vi.mock('next/navigation', () => ({ usePathname: () => nav.pathname }));
const pilot = vi.hoisted(() => ({ pilotMode: true }));
vi.mock('../shell/pilot-context', () => ({
  usePilot: () => ({ pilotMode: pilot.pilotMode, status: null, loaded: true }),
  PilotProvider: ({ children }: { children: React.ReactNode }) => children,
}));

import { HERO } from '../../../content/home';
import { PRICING } from '../../../content/pricing';
import { JoinButton } from './join-button';
import { JoinProvider, useJoin } from './join-provider';
import { SideProvider } from '../shell/side-context';

const PATHS = { agency: ['/agencies', '/agencies/pricing'], business: ['/business', '/business/pricing'] };

function OpenNow() {
  const { open } = useJoin();
  return <button type="button" onClick={() => open()}>Open now</button>;
}

function App() {
  return (
    <SideProvider paths={PATHS}>
      <JoinProvider>
        <JoinButton />
        <OpenNow />
      </JoinProvider>
    </SideProvider>
  );
}

async function mount(pathname: string) {
  nav.pathname = pathname;
  const view = render(<App />);
  await act(async () => {});
  return view;
}

const stepLabel = () => screen.queryByText(/Step \d of 2/);
const back = () => screen.queryByRole('button', { name: 'Back' });

beforeEach(() => {
  pilot.pilotMode = true;
  nav.pathname = '/';
  window.history.replaceState(null, '', '/');
});
afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
});

describe('join popup per side', () => {
  it('on /agencies the button opens the agency form with no Back and no step label', async () => {
    await mount('/agencies');
    fireEvent.click(screen.getByRole('button', { name: HERO.primaryCta }));
    expect(screen.getByText('About your agency')).toBeTruthy();
    expect(back()).toBeNull();
    expect(stepLabel()).toBeNull();
  });

  it('on /business it opens the business form with no Back and no step label', async () => {
    await mount('/business');
    fireEvent.click(screen.getByRole('button', { name: 'Join the waitlist' }));
    expect(screen.getByText('About your business')).toBeTruthy();
    expect(back()).toBeNull();
    expect(stepLabel()).toBeNull();
  });

  it('on / it opens the choose step, and step 2 has Back and its step label', async () => {
    await mount('/');
    fireEvent.click(screen.getByRole('button', { name: HERO.primaryCta }));
    expect(screen.getByText('Join the Rival Monday pilot')).toBeTruthy();
    expect(screen.getByText('Step 1 of 2')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByText('About your agency')).toBeTruthy();
    expect(back()).toBeTruthy();
    expect(screen.getByText(/Step 2 of 2/)).toBeTruthy();
  });

  it('on /sample-brief it behaves as on /', async () => {
    await mount('/sample-brief');
    fireEvent.click(screen.getByRole('button', { name: HERO.primaryCta }));
    expect(screen.getByText('Join the Rival Monday pilot')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(back()).toBeTruthy();
    expect(screen.getByText(/Step 2 of 2/)).toBeTruthy();
  });

  it('#join follows the side', async () => {
    window.history.replaceState(null, '', '/agencies#join');
    await mount('/agencies');
    expect(screen.getByText('About your agency')).toBeTruthy();
    expect(back()).toBeNull();
    cleanup();
    window.history.replaceState(null, '', '/business#join');
    await mount('/business');
    expect(screen.getByText('About your business')).toBeTruthy();
    expect(back()).toBeNull();
    cleanup();
    window.history.replaceState(null, '', '/#join');
    await mount('/');
    expect(screen.getByText('Join the Rival Monday pilot')).toBeTruthy();
  });

  it('?join=business opens the business form on an agency page', async () => {
    window.history.replaceState(null, '', '/agencies?join=business');
    await mount('/agencies');
    expect(screen.getByText('About your business')).toBeTruthy();
    expect(back()).toBeNull();
    expect(stepLabel()).toBeNull();
  });

  it('pilot off on /agencies: #join shows the choose step', async () => {
    pilot.pilotMode = false;
    window.history.replaceState(null, '', '/agencies#join');
    await mount('/agencies');
    expect(screen.getByText('Get started with Rival Monday')).toBeTruthy();
    expect(screen.getByText('Step 1 of 2')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByText('About your business')).toBeTruthy();
    expect(back()).toBeTruthy();
    expect(screen.getByText(/Step 2 of 2/)).toBeTruthy();
  });

  it('after the pathname changes side, the next open() uses the new side', async () => {
    const view = await mount('/agencies');
    fireEvent.click(screen.getByRole('button', { name: 'Open now' }));
    expect(screen.getByText('About your agency')).toBeTruthy();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    expect(screen.queryByText('About your agency')).toBeNull();
    nav.pathname = '/business';
    view.rerender(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Open now' }));
    expect(screen.getByText('About your business')).toBeTruthy();
    expect(back()).toBeNull();
  });

  it('the popup closes when the address changes', async () => {
    const view = await mount('/agencies');
    fireEvent.click(screen.getByRole('button', { name: 'Open now' }));
    expect(screen.getByText('About your agency')).toBeTruthy();
    const replace = vi.spyOn(window.history, 'replaceState');
    const goBack = vi.spyOn(window.history, 'back');
    nav.pathname = '/business';
    view.rerender(<App />);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(replace).not.toHaveBeenCalled();
    expect(goBack).not.toHaveBeenCalled();
    replace.mockRestore();
    goBack.mockRestore();
  });

  it('a #join that arrives with a new address opens the popup after the close', async () => {
    const view = await mount('/agencies');
    fireEvent.click(screen.getByRole('button', { name: 'Open now' }));
    window.history.replaceState(null, '', '/business#join');
    nav.pathname = '/business';
    view.rerender(<App />);
    await act(async () => {});
    expect(screen.getByText('About your business')).toBeTruthy();
  });

  it('a popup opened on /business shows no agency plan number', async () => {
    const a = PRICING.agency;
    const nums = [a.monthlyUsd, a.yearlyUsd, ...a.extraClientTiers.map((t) => t.usd)];
    const forbidden = [...new Set(nums.flatMap((n) => [`$${n}`, `$${n.toLocaleString('en-US')}`]))];
    for (const pilotMode of [true, false]) {
      pilot.pilotMode = pilotMode;
      await mount('/business');
      fireEvent.click(screen.getByRole('button', { name: 'Join the waitlist' }));
      const text = document.body.textContent!;
      for (const f of forbidden) expect(new RegExp(`${f.replace('$', '\\$')}(?![\\d,])`).test(text), `${pilotMode} ${f}`).toBe(false);
      cleanup();
    }
  });
});
