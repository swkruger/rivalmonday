// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ReadOnlyProvider } from '@/components/read-only';
import { buttonHtml, IntakeLinkCard } from './intake-link-card';

// jsdom has no ResizeObserver; Radix Switch's thumb needs one to mount at all.
if (typeof globalThis.ResizeObserver === 'undefined') {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  globalThis.ResizeObserver = ResizeObserverStub;
}

const link = { slug: 'acme', enabled: true, url: 'https://app.example/start/acme', counts: { newThisMonth: 4, accepted: 2 } };
const props = { save: vi.fn(), toggle: vi.fn() };

describe('IntakeLinkCard', () => {
  it('builds the button snippet around the link with the agreed text', () => {
    const html = buttonHtml(link.url);
    expect(html.startsWith('<a href="https://app.example/start/acme" style="')).toBe(true);
    expect(html.endsWith('>Get your free competitor snapshot</a>')).toBe(true);
  });

  it('escapes & " < > in the URL inside the href', () => {
    expect(buttonHtml('https://x.co/s?a=1&b="<>')).toContain('href="https://x.co/s?a=1&amp;b=&quot;&lt;&gt;"');
  });

  it("15a §2.10: the button uses the agency's primary colour; the token default only when unset or invalid", () => {
    expect(buttonHtml(link.url, '#7A3EE8')).toContain('background:#7A3EE8;');
    expect(buttonHtml(link.url, '#abc')).toContain('background:#abc;');
    for (const unset of [undefined, null, '', 'red;color:#000', '#12345g', 'url(javascript:x)']) {
      expect(buttonHtml(link.url, unset)).toContain('background:#47A8E7;');
    }
  });

  it('Copy button HTML copies the snippet in the agency colour', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    render(<IntakeLinkCard link={link} primary="#7A3EE8" {...props} />);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Copy button HTML' })));
    expect(writeText).toHaveBeenCalledWith(buttonHtml(link.url, '#7A3EE8'));
    expect(writeText.mock.calls[0]![0]).toContain('background:#7A3EE8;');
  });

  it('shows the link, copy buttons, state and counts', () => {
    render(<IntakeLinkCard link={link} {...props} />);
    expect(screen.getByText(link.url)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Copy link' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Copy button HTML' })).toBeTruthy();
    expect(screen.getByText('Accepting new leads')).toBeTruthy();
    expect(screen.getByText('4')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
  });

  it('offers Create link when there is no link yet, and hides the form in a read-only session', () => {
    const none = { slug: null, enabled: false, url: null, counts: { newThisMonth: 0, accepted: 0 } };
    const { unmount } = render(<IntakeLinkCard link={none} {...props} />);
    expect(screen.getByRole('button', { name: 'Create link' })).toBeTruthy();
    unmount();
    render(
      <ReadOnlyProvider readOnly>
        <IntakeLinkCard link={link} {...props} />
      </ReadOnlyProvider>,
    );
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
  });
});
