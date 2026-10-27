// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Table, TableBody, TableCell, TableRow } from './table';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function sized(scrollWidth: number, clientWidth: number) {
  vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockReturnValue(scrollWidth);
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(clientWidth);
}

const rows = (
  <TableBody>
    <TableRow><TableCell>A</TableCell></TableRow>
  </TableBody>
);

describe('Table scroll container', () => {
  it('is a plain, unfocusable wrapper when the table fits', () => {
    sized(300, 300);
    render(<Table aria-label="Prices">{rows}</Table>);
    const box = document.querySelector('[data-slot="table-container"]')!;
    expect(box.hasAttribute('tabindex')).toBe(false);
    expect(box.hasAttribute('role')).toBe(false);
    expect(screen.queryByRole('region')).toBeNull();
  });

  it('becomes a focusable region named after the table when it overflows', () => {
    sized(900, 300);
    render(<Table aria-label="Prices">{rows}</Table>);
    const region = screen.getByRole('region', { name: 'Prices' });
    expect(region.getAttribute('tabindex')).toBe('0');
    expect(region.getAttribute('data-slot')).toBe('table-container');
  });

  it('falls back to the caption for the region name', () => {
    sized(900, 300);
    render(
      <Table>
        <caption>Rank history</caption>
        {rows}
      </Table>,
    );
    expect(screen.getByRole('region', { name: 'Rank history' })).toBeTruthy();
  });

  it('re-checks on resize', () => {
    let observed: ResizeObserverCallback | undefined;
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(cb: ResizeObserverCallback) { observed = cb; }
        observe() {}
        disconnect() {}
      },
    );
    sized(300, 300);
    render(<Table aria-label="Prices">{rows}</Table>);
    expect(screen.queryByRole('region')).toBeNull();
    sized(900, 300);
    act(() => observed!([], {} as ResizeObserver));
    expect(screen.getByRole('region', { name: 'Prices' })).toBeTruthy();
    vi.unstubAllGlobals();
  });
});
