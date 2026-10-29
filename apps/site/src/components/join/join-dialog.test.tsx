import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/env', () => ({
  siteEnv: { appUrl: 'https://app.test', clientPriceUsd: 99, social: {} },
}));
const fetchSiteStatus = vi.fn();
vi.mock('../../lib/site-status', async (orig) => ({ ...(await orig<typeof import('../../lib/site-status')>()), fetchSiteStatus: (...a: unknown[]) => fetchSiteStatus(...a) }));

import { JoinButton } from './join-button';
import { JoinProvider } from './join-provider';
import { PilotProvider } from '../shell/pilot-context';

function App() {
  return (
    <PilotProvider>
      <JoinProvider>
        <JoinButton>Join the pilot</JoinButton>
        <JoinButton start="business">Business</JoinButton>
      </JoinProvider>
    </PilotProvider>
  );
}

async function renderApp() {
  render(<App />);
  await act(async () => {});
}

beforeEach(() => {
  fetchSiteStatus.mockResolvedValue(null);
  window.history.replaceState(null, '', '/');
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const type = (label: RegExp | string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe('join dialog', () => {
  it('step 1 → agency shows the agency fields', async () => {
    await renderApp();
    fireEvent.click(screen.getAllByRole('button', { name: 'Join the pilot' })[0]!);
    expect(screen.getByText('Join the Rival Monday pilot')).toBeTruthy();
    expect(screen.getByText('Step 1 of 2')).toBeTruthy();
    fireEvent.click(screen.getByRole('radio', { name: /I run an agency/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByText('About your agency')).toBeTruthy();
    for (const l of [/Your name/, /Work email/, /Agency name/, /Website/, /Local-business clients/]) expect(screen.getByLabelText(l)).toBeTruthy();
    expect(screen.queryByLabelText('Client business name')).toBeNull();
    fireEvent.click(screen.getByLabelText('Send me a real sample brief for one of my clients'));
    expect(screen.getByLabelText(/Client business name/)).toBeTruthy();
  });

  it('business path lists the committed verticals plus Other', async () => {
    await renderApp();
    fireEvent.click(screen.getByRole('button', { name: 'Business' }));
    expect(screen.getByText('About your business')).toBeTruthy();
    const select = screen.getByLabelText(/Type of business/) as HTMLSelectElement;
    expect([...select.options].map((o) => o.text)).toEqual(expect.arrayContaining(['HVAC & Plumbing', 'Dental practices', 'Other…']));
    expect(screen.queryByLabelText('Describe your business')).toBeNull();
    fireEvent.change(select, { target: { value: 'other' } });
    expect(screen.getByLabelText(/Describe your business/)).toBeTruthy();
  });

  it('back keeps typed values', async () => {
    await renderApp();
    fireEvent.click(screen.getAllByRole('button', { name: 'Join the pilot' })[0]!);
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    type(/Your name/, 'Jane Doe');
    type(/Agency name/, 'Doe Digital');
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByText('Join the Rival Monday pilot')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect((screen.getByLabelText(/Your name/) as HTMLInputElement).value).toBe('Jane Doe');
    expect((screen.getByLabelText(/Agency name/) as HTMLInputElement).value).toBe('Doe Digital');
  });

  it('errors appear inline and focus the first', async () => {
    await renderApp();
    fireEvent.click(screen.getAllByRole('button', { name: 'Join the pilot' })[0]!);
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    type(/Work email/, 'nope');
    fireEvent.click(screen.getByRole('button', { name: 'Join the waitlist' }));
    expect(screen.getByText('Enter your name.')).toBeTruthy();
    expect(screen.getByText('Enter a valid email address.')).toBeTruthy();
    expect(screen.getByText('Enter the agency name.')).toBeTruthy();
    expect(screen.getByText('Pick how many local-business clients you have.')).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByLabelText(/Your name/));
    expect(screen.getByLabelText(/Your name/).getAttribute('aria-invalid')).toBe('true');
  });

  it('#join opens the dialog, also on hashchange', async () => {
    window.history.replaceState(null, '', '/#join');
    await renderApp();
    expect(screen.getByText('Join the Rival Monday pilot')).toBeTruthy();
    cleanup();
    window.history.replaceState(null, '', '/');
    await renderApp();
    expect(screen.queryByText('Join the Rival Monday pilot')).toBeNull();
    await act(async () => {
      window.location.hash = '#join';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(screen.getByText('Join the Rival Monday pilot')).toBeTruthy();
  });

  it('?join=business opens the business step', async () => {
    window.history.replaceState(null, '', '/?join=business');
    await renderApp();
    expect(screen.getByText('About your business')).toBeTruthy();
  });

  it('pilot off makes the agency choice a sign-up link', async () => {
    fetchSiteStatus.mockResolvedValue({ pilotMode: false, counters: { rivalSitesWatched: 1, snapshotsThisWeek: 1, claimsChecked: 1, claimsDropped: 0 } });
    window.history.replaceState(null, '', '/#join');
    await renderApp();
    const link = screen.getByRole('link', { name: /I run an agency/ });
    expect(link.getAttribute('href')).toBe('https://app.test/sign-up');
  });
});
