import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const env = vi.hoisted(() => ({ siteEnv: { appUrl: 'https://app.test', clientPriceUsd: 99, social: {}, turnstileSiteKey: null as string | null } }));
vi.mock('../../lib/env', () => env);
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
  env.siteEnv.turnstileSiteKey = null;
  delete window.turnstile;
  fetchSiteStatus.mockResolvedValue(null);
  window.history.replaceState(null, '', '/');
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete window.turnstile;
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
  describe('submit (Task 8)', () => {
    function stubTurnstile() {
      const api = { render: vi.fn((_el: HTMLElement, _o: Record<string, unknown>) => 'w1'), reset: vi.fn(), remove: vi.fn() };
      window.turnstile = api;
      const token = (t: string) => act(() => (api.render.mock.calls.at(-1)![1] as { callback: (t: string) => void }).callback(t));
      return { api, token };
    }
    function fillBusiness() {
      type(/Your name/, 'Sam Roe');
      type(/Email/, 'sam@roe.test');
      type(/Business name/, 'Roe Heating');
      type(/or city/, 'Austin');
      fireEvent.change(screen.getByLabelText(/Type of business/), { target: { value: 'dental' } });
    }
    const send = () => act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Join the waitlist' })); });

    it('submit blocked until a token when a key is set', async () => {
      env.siteEnv.turnstileSiteKey = 'site-key';
      const { api, token } = stubTurnstile();
      const submit = vi.fn().mockResolvedValue({ ok: true });
      render(<PilotProvider><JoinDialog open start="business" onClose={() => {}} submit={submit} /></PilotProvider>);
      await act(async () => {});
      expect(api.render).toHaveBeenCalledOnce();
      fillBusiness();
      await send();
      expect(submit).not.toHaveBeenCalled();
      expect(screen.getByRole('alert').textContent).toBe('Still checking, try again in a moment.');
      token('tok-1');
      await send();
      expect(submit).toHaveBeenCalledOnce();
      expect(submit.mock.calls[0]![1]).toBe('tok-1');
      expect(screen.getByText("You're on the list. We've emailed you a confirmation.")).toBeTruthy();
    });

    it('token reset after every attempt', async () => {
      env.siteEnv.turnstileSiteKey = 'site-key';
      const { api, token } = stubTurnstile();
      const submit = vi.fn()
        .mockResolvedValueOnce({ ok: false, reason: 'check' })
        .mockResolvedValueOnce({ ok: false, reason: 'unavailable' })
        .mockResolvedValueOnce({ ok: false, reason: 'invalid' });
      render(<PilotProvider><JoinDialog open start="business" onClose={() => {}} submit={submit} /></PilotProvider>);
      await act(async () => {});
      fillBusiness();
      token('tok-1');
      await send();
      expect(submit).toHaveBeenCalledTimes(1);
      expect(api.reset).toHaveBeenCalledTimes(1);
      expect(screen.getByRole('alert').textContent).toBe("The check didn't go through. Please try it again.");
      await send(); // the used token is gone
      expect(submit).toHaveBeenCalledTimes(1);
      expect(screen.getByRole('alert').textContent).toBe('Still checking, try again in a moment.');
      token('tok-2');
      await send();
      expect(submit.mock.calls[1]![1]).toBe('tok-2');
      expect(api.reset).toHaveBeenCalledTimes(2);
      expect(screen.getByRole('alert').textContent).toBe("We couldn't send this just now. Please try again in a minute, or email support@rivalmonday.app.");
      token('tok-3');
      await send();
      expect(submit.mock.calls[2]![1]).toBe('tok-3');
      expect(api.reset).toHaveBeenCalledTimes(3);
      expect(screen.getByRole('alert').textContent).toBe('Please check the details above.');
      expect((screen.getByRole('button', { name: 'Join the waitlist' }) as HTMLButtonElement).disabled).toBe(false);
    });

    it('double submit is blocked while in flight', async () => {
      let resolve!: (v: { ok: true }) => void;
      const submit = vi.fn(() => new Promise<{ ok: true }>((r) => { resolve = r; }));
      render(<PilotProvider><JoinDialog open start="business" onClose={() => {}} submit={submit} /></PilotProvider>);
      await act(async () => {});
      fillBusiness();
      const button = screen.getByRole('button', { name: 'Join the waitlist' });
      await act(async () => {
        fireEvent.click(button);
        fireEvent.submit(button.closest('form')!);
      });
      expect(submit).toHaveBeenCalledOnce();
      expect((submit.mock.calls[0] as unknown[])[1]).toBe('no-widget');
      expect(button.getAttribute('aria-busy')).toBe('true');
      await act(async () => resolve({ ok: true }));
    });

    async function joinThroughProvider() {
      fireEvent.click(screen.getByRole('button', { name: 'Business' }));
      fillBusiness();
      await send();
      await act(async () => {});
      expect(screen.getByText("You're on the list. We've emailed you a confirmation.")).toBeTruthy();
      fireEvent.click(screen.getAllByRole('button', { name: 'Close' })[0]!);
      expect(screen.queryByText("You're on the list. We've emailed you a confirmation.")).toBeNull();
    }

    it('duplicate and new both show the done state', async () => {
      // The route answers 200 {ok:true} for new, duplicate and rate-limited alike.
      const f = vi.fn(async (..._a: unknown[]) => new Response(JSON.stringify({ ok: true }), { status: 200 }));
      vi.stubGlobal('fetch', f);
      await renderApp();
      await joinThroughProvider();
      await joinThroughProvider();
      expect(f).toHaveBeenCalledTimes(2);
      const [url, init] = f.mock.calls[0]! as unknown as [string, RequestInit];
      expect(url).toBe('https://app.test/api/waitlist');
      expect(init.credentials).toBe('omit');
      const sent = JSON.parse(init.body as string);
      expect(sent).toMatchObject({ kind: 'business', email: 'sam@roe.test', verticalId: 'dental', turnstileToken: 'no-widget' });
    });

    it('nothing logged', async () => {
      const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}));
      const f = vi.fn()
        .mockRejectedValueOnce(new TypeError('Failed to fetch'))
        .mockResolvedValueOnce(new Response(JSON.stringify({ ok: false, error: 'invalid' }), { status: 400 }))
        .mockResolvedValueOnce(new Response('oops', { status: 500 }))
        .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
      vi.stubGlobal('fetch', f);
      await renderApp();
      fireEvent.click(screen.getByRole('button', { name: 'Business' }));
      fillBusiness();
      for (let i = 0; i < 4; i++) {
        await send();
        await act(async () => {});
      }
      expect(f).toHaveBeenCalledTimes(4);
      expect(screen.getByText("You're on the list. We've emailed you a confirmation.")).toBeTruthy();
      for (const spy of spies) expect(spy).not.toHaveBeenCalled();
    });
  });
});
