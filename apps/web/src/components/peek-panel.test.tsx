// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createPortal } from 'react-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type PeekNav, PeekPanel } from './peek-panel';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

const labels = { prev: 'Previous change', next: 'Next change', close: 'Close details' };
const nav = (over: Partial<PeekNav> = {}): PeekNav => ({
  prevHref: '/c/1/changes?event=a',
  nextHref: '/c/1/changes?event=c',
  closeHref: '/c/1/changes',
  rowId: 'b',
  labels,
  ...over,
});

function ui(n: PeekNav) {
  return (
    <>
      <a href="/c/1/changes?event=b" data-row-id="b">row b</a>
      <PeekPanel label="Change details" nav={n}>
        <a href="/inside">inside link</a>
      </PeekPanel>
    </>
  );
}

describe('PeekPanel', () => {
  beforeEach(() => push.mockClear());
  afterEach(cleanup);

  it('is a region named by its label with data-slot peek-panel', () => {
    render(ui(nav()));
    const region = screen.getByRole('region', { name: 'Change details' });
    expect(region.getAttribute('data-slot')).toBe('peek-panel');
    expect(screen.queryByRole('heading', { name: 'Change details' })).toBeNull();
  });

  it('renders previous, next and close links with the given hrefs and names', () => {
    render(ui(nav()));
    expect(screen.getByRole('link', { name: 'Previous change' }).getAttribute('href')).toBe('/c/1/changes?event=a');
    expect(screen.getByRole('link', { name: 'Next change' }).getAttribute('href')).toBe('/c/1/changes?event=c');
    expect(screen.getByRole('link', { name: 'Close details' }).getAttribute('href')).toBe('/c/1/changes');
  });

  it('a null prev renders a disabled span, not a link', () => {
    const { container } = render(ui(nav({ prevHref: null })));
    expect(screen.queryByRole('link', { name: 'Previous change' })).toBeNull();
    const span = container.querySelector('span[aria-disabled="true"]');
    expect(span).not.toBeNull();
    expect(span!.hasAttribute('tabindex')).toBe(false);
    expect(screen.getByRole('img', { name: 'Previous change' })).toBe(span);
  });

  it('a null next renders a disabled span, not a link', () => {
    render(ui(nav({ nextHref: null })));
    expect(screen.queryByRole('link', { name: 'Next change' })).toBeNull();
  });

  it('no Close without closeHref', () => {
    render(ui(nav({ closeHref: null })));
    expect(screen.queryByRole('link', { name: 'Close details' })).toBeNull();
  });

  it('Escape in the panel pushes closeHref once and focuses the open row', () => {
    render(ui(nav()));
    fireEvent.keyDown(screen.getByRole('link', { name: 'inside link' }), { key: 'Escape' });
    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith('/c/1/changes', { scroll: false });
    expect(document.activeElement).toBe(screen.getByText('row b'));
  });

  it('Escape without closeHref does nothing', () => {
    render(ui(nav({ closeHref: null })));
    const inside = screen.getByRole('link', { name: 'inside link' });
    inside.focus();
    fireEvent.keyDown(inside, { key: 'Escape' });
    expect(push).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(inside);
  });

  it('other keys do nothing', () => {
    render(ui(nav()));
    fireEvent.keyDown(screen.getByRole('link', { name: 'inside link' }), { key: 'Enter' });
    expect(push).not.toHaveBeenCalled();
  });

  it('an Escape already handled (defaultPrevented) does nothing', () => {
    render(ui(nav()));
    const inside = screen.getByRole('link', { name: 'inside link' });
    const ev = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    ev.preventDefault();
    inside.dispatchEvent(ev);
    expect(push).not.toHaveBeenCalled();
  });

  it('an Escape from outside the panel DOM (portalled popover) does nothing', () => {
    function Portalled() {
      return createPortal(<button type="button">tip</button>, document.body);
    }
    render(
      <PeekPanel label="Change details" nav={nav()}>
        <Portalled />
      </PeekPanel>,
    );
    fireEvent.keyDown(screen.getByRole('button', { name: 'tip' }), { key: 'Escape' });
    expect(push).not.toHaveBeenCalled();
  });
});
