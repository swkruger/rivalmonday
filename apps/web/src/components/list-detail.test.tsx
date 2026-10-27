// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ListDetail } from './list-detail';
import type { PeekNav } from './peek-panel';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

function stubMatchMedia(matches: boolean) {
  window.matchMedia = ((q: string) => ({
    matches,
    media: q,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
}

const peek: PeekNav = {
  prevHref: null,
  nextHref: '/c/1/changes?event=b',
  closeHref: '/c/1/changes',
  rowId: 'a',
  labels: { prev: 'Previous change', next: 'Next change', close: 'Close details' },
};

function ui(open: boolean, withPeek?: PeekNav) {
  return (
    <ListDetail
      peek={withPeek}
      list={<ul><li>row</li></ul>}
      detail={<p>detail body</p>}
      selectedId="a"
      sheetOpen={open}
      closeHref="/c/1/changes"
      listLabel="Changes list"
      detailTitle="Change detail"
    />
  );
}

describe('ListDetail', () => {
  beforeEach(() => push.mockClear());
  afterEach(cleanup);

  it('sheet stays closed at lg', () => {
    stubMatchMedia(true);
    render(ui(true));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('bare visit below lg shows only the list', () => {
    stubMatchMedia(false);
    render(ui(false));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByText('row')).toBeTruthy();
  });

  it('below lg with open shows the sheet titled detailTitle', () => {
    stubMatchMedia(false);
    render(ui(true));
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText('Change detail')).toBeTruthy();
  });

  it('close pushes closeHref', () => {
    stubMatchMedia(false);
    render(ui(true));
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith('/c/1/changes');
  });

  it('server render has no dialog', () => {
    expect(renderToString(ui(true))).not.toContain('role="dialog"');
  });

  it('list region has aria-label', () => {
    stubMatchMedia(true);
    render(ui(false));
    expect(screen.getByRole('region', { name: 'Changes list' })).toBeTruthy();
  });

  it('with peek the lg column holds the peek panel labelled detailTitle', () => {
    stubMatchMedia(true);
    const { container } = render(ui(false, peek));
    const panel = container.querySelector('[data-slot=peek-panel]');
    expect(panel).not.toBeNull();
    expect(panel!.getAttribute('aria-label')).toBe('Change detail');
    expect(screen.getByRole('region', { name: 'Change detail' })).toBe(panel);
    expect(screen.getByRole('link', { name: 'Next change' })).toBeTruthy();
    expect(screen.getByText('detail body')).toBeTruthy();
  });

  it('below lg with sheetOpen the dialog has no peek chrome', () => {
    stubMatchMedia(false);
    render(ui(true, peek));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).queryByRole('link', { name: 'Next change' })).toBeNull();
    expect(within(dialog).getByText('detail body')).toBeTruthy();
  });

  it('without peek there is no panel', () => {
    stubMatchMedia(true);
    const { container } = render(ui(false));
    expect(container.querySelector('[data-slot=peek-panel]')).toBeNull();
    expect(screen.queryByRole('link', { name: 'Next change' })).toBeNull();
  });
});
