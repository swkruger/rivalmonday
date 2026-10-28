// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { minutesLeft, SupportBanner } from './support-banner';

const SID = '11111111-1111-4111-8111-111111111111';
afterEach(() => vi.useRealTimers());

describe('SupportBanner', () => {
  it('uses the warning recipe, never the amber accent, and keeps its region label', () => {
    render(<SupportBanner sessionId={SID} agencyName="Acme" reason="r" expiresAt={new Date(Date.now() + 60_000).toISOString()} />);
    const region = screen.getByRole('region', { name: 'Support session' });
    expect(region.getAttribute('data-tone')).toBe('warning');
  });

  it('shows the agency, the reason, the minutes left and an Exit form posting to /support/exit', () => {
    const expiresAt = new Date(Date.now() + 30 * 60_000).toISOString();
    const { container } = render(<SupportBanner sessionId={SID} agencyName="Acme Agency" reason="Checking brief setup" expiresAt={expiresAt} />);
    expect(screen.getByText('Acme Agency').tagName).toBe('STRONG');
    expect(screen.getByText('Checking brief setup')).toBeTruthy();
    expect(screen.getByTestId('support-minutes').textContent).toBe('· 30 min left');
    expect(container.textContent).toContain('as platform · read only ·');
    const form = container.querySelector('form')!;
    expect(form.getAttribute('method')).toBe('post');
    expect(form.getAttribute('action')).toBe('/support/exit');
    expect(screen.getByRole('button', { name: 'Exit' }).getAttribute('type')).toBe('submit');
  });

  it('counts down every 30 s and shows the ended state at 0, linking to the exit', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-13T10:00:00Z'));
    render(<SupportBanner sessionId={SID} agencyName="Acme" reason="reason here" expiresAt="2026-10-13T10:01:00Z" />);
    expect(screen.getByTestId('support-minutes').textContent).toBe('· 1 min left');
    act(() => { vi.advanceTimersByTime(60_000); });
    const link = screen.getByRole('link', { name: 'Session ended — reload' });
    expect(link.getAttribute('href')).toBe(`/support/end?sid=${SID}&next=%2Fagency`);
    expect(screen.queryByRole('button', { name: 'Exit' })).toBeNull();
  });

  it('minutesLeft rounds up and never goes below 0', () => {
    const now = Date.parse('2026-10-13T10:00:00Z');
    expect(minutesLeft('2026-10-13T10:00:01Z', now)).toBe(1);
    expect(minutesLeft('2026-10-13T09:00:00Z', now)).toBe(0);
  });
});
