// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ListDetail } from './list-detail';

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

function ui(open: boolean) {
  return (
    <ListDetail
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
});
