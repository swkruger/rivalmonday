// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
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
