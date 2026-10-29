import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/env', () => ({
  siteEnv: { appUrl: 'https://app.test', clientPriceUsd: 99, social: {} },
}));
const fetchSiteStatus = vi.fn();
vi.mock('../../lib/site-status', async (orig) => ({ ...(await orig<typeof import('../../lib/site-status')>()), fetchSiteStatus: (...a: unknown[]) => fetchSiteStatus(...a) }));

import { JoinButton } from './join-button';
import { JoinDialog } from './join-dialog';
import { JoinProvider, useJoin } from './join-provider';
import { PilotProvider } from '../shell/pilot-context';

function OpenAgency() {
  const { open } = useJoin();
  return <button type="button" onClick={() => open('agency')}>Open agency</button>;
}

function App() {
  return (
    <PilotProvider>
      <JoinProvider>
        <JoinButton>Join the pilot</JoinButton>
        <JoinButton start="business">Business</JoinButton>
        <OpenAgency />
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

  it('close, then #join again, reopens; the address bar is cleaned', async () => {
    window.history.replaceState(null, '', '/#join');
    await renderApp();
    expect(window.location.hash).toBe('');
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByText('Join the Rival Monday pilot')).toBeNull();
    await act(async () => {
      window.location.hash = '#join';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(screen.getByText('Join the Rival Monday pilot')).toBeTruthy();
  });

  it('reload after close does not reopen', async () => {
    window.history.replaceState(null, '', '/?join=business#join');
    await renderApp();
    expect(screen.getByText('About your business')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(window.location.search + window.location.hash).toBe('');
    cleanup();
    await renderApp();
    expect(screen.queryByText('About your business')).toBeNull();
    expect(screen.queryByText('Join the Rival Monday pilot')).toBeNull();
  });

  it('step change moves focus to the new step', async () => {
    await renderApp();
    fireEvent.click(screen.getAllByRole('button', { name: 'Join the pilot' })[0]!);
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(document.activeElement).toBe(screen.getByText('About your agency'));
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(document.activeElement).toBe(screen.getByText('Join the Rival Monday pilot'));
  });

  it('done moves focus to the done heading', async () => {
    const submit = vi.fn().mockResolvedValue({ ok: true });
    render(<PilotProvider><JoinDialog open start="business" onClose={() => {}} submit={submit} /></PilotProvider>);
    await act(async () => {});
    type(/Your name/, 'Sam Roe');
    type(/Email/, 'sam@roe.test');
    type(/Business name/, 'Roe Heating');
    type(/or city/, 'Austin');
    fireEvent.change(screen.getByLabelText(/Type of business/), { target: { value: 'dental' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Join the waitlist' })); });
    expect(submit).toHaveBeenCalledOnce();
    const heading = screen.getByText("You're on the list. We've emailed you a confirmation.");
    expect(document.activeElement).toBe(heading);
  });

  it('a throwing submit shows a generic error and re-enables the button', async () => {
    const submit = vi.fn().mockRejectedValue(new Error('boom'));
    render(<PilotProvider><JoinDialog open start="business" onClose={() => {}} submit={submit} /></PilotProvider>);
    await act(async () => {});
    type(/Your name/, 'Sam Roe');
    type(/Email/, 'sam@roe.test');
    type(/Business name/, 'Roe Heating');
    type(/or city/, 'Austin');
    fireEvent.change(screen.getByLabelText(/Type of business/), { target: { value: 'dental' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Join the waitlist' })); });
    expect(screen.getByRole('alert').textContent).toBe('Something went wrong. Please try again.');
    expect((screen.getByRole('button', { name: 'Join the waitlist' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('pilot off: start=agency shows the sign-up link, not the agency form, link outside the radiogroup', async () => {
    fetchSiteStatus.mockResolvedValue({ pilotMode: false, counters: { rivalSitesWatched: 1, snapshotsThisWeek: 1, claimsChecked: 1, claimsDropped: 0 } });
    await renderApp();
    fireEvent.click(screen.getByRole('button', { name: 'Open agency' }));
    expect(screen.queryByText('About your agency')).toBeNull();
    const link = screen.getByRole('link', { name: /I run an agency/ });
    expect(link.getAttribute('href')).toBe('https://app.test/sign-up');
    expect(link.closest('[role="radiogroup"]')).toBeNull();
  });
});
