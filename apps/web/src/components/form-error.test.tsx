// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ErrorNote, FormError } from './form-error';

afterEach(cleanup);
const cap = { ok: false, error: "You've used your 3 included clients. Upgrade to add more.", code: 'billing_seat_limit' } as const;

describe('FormError (billing cap Upgrade prompt)', () => {
  it('shows the message and, for an agency admin on a seat-limit refusal, an Upgrade link to billing', () => {
    render(<FormError state={cap} canUpgrade />);
    expect(screen.getByRole('alert').textContent).toContain("You've used your 3 included clients. Upgrade to add more.");
    expect(screen.getByRole('link', { name: 'Upgrade' }).getAttribute('href')).toBe('/agency/settings/billing');
  });

  it('account managers only see the message', () => {
    render(<FormError state={cap} canUpgrade={false} />);
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('other errors never get the link; success renders nothing', () => {
    const { container, rerender } = render(<FormError state={{ ok: false, error: 'Choose a role' }} canUpgrade />);
    expect(screen.queryByRole('link')).toBeNull();
    rerender(<FormError state={{ ok: true }} canUpgrade />);
    expect(container.innerHTML).toBe('');
  });
});

describe('ErrorNote', () => {
  it('focuses itself and scrolls into view on mount', () => {
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    render(<ErrorNote>Boom</ErrorNote>);
    expect(document.activeElement).toBe(screen.getByRole('alert'));
    expect(scroll).toHaveBeenCalledTimes(1);
  });

  it('refocuses when focusKey changes', () => {
    Element.prototype.scrollIntoView = vi.fn();
    const { rerender } = render(<><ErrorNote focusKey={1}>Boom</ErrorNote><button>other</button></>);
    screen.getByRole('button', { name: 'other' }).focus();
    rerender(<><ErrorNote focusKey={1}>Boom</ErrorNote><button>other</button></>);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'other' }));
    rerender(<><ErrorNote focusKey={2}>Boom</ErrorNote><button>other</button></>);
    expect(document.activeElement).toBe(screen.getByRole('alert'));
  });

  it('quiet renders role=status and never focuses', () => {
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    render(<ErrorNote quiet>Hint</ErrorNote>);
    expect(screen.getByRole('status')).toBeTruthy();
    expect(document.activeElement).toBe(document.body);
    expect(scroll).not.toHaveBeenCalled();
  });

  it('passive keeps the danger style, renders role=status and never focuses or scrolls, even when focusKey changes', () => {
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    const { rerender } = render(<ErrorNote passive focusKey={1}>Stored failure</ErrorNote>);
    const note = screen.getByRole('status');
    expect(note.className).toContain('border-danger/30');
    rerender(<ErrorNote passive focusKey={2}>Stored failure</ErrorNote>);
    expect(document.activeElement).toBe(document.body);
    expect(scroll).not.toHaveBeenCalled();
  });

  it('renders the alert icon aria-hidden', () => {
    Element.prototype.scrollIntoView = vi.fn();
    render(<ErrorNote>Boom</ErrorNote>);
    expect(screen.getByRole('alert').querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });
});
