// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { HairlineCell, HairlineGrid } from './hairline-grid';

afterEach(cleanup);

describe('HairlineGrid', () => {
  it('exposes data-slots and cols', () => {
    const { container } = render(
      <HairlineGrid cols={3}>
        <HairlineCell>a</HairlineCell>
        <HairlineCell>b</HairlineCell>
      </HairlineGrid>,
    );
    expect(container.querySelector('[data-slot=hairline-grid]')?.getAttribute('data-cols')).toBe('3');
    expect(container.querySelectorAll('[data-slot=hairline-cell]')).toHaveLength(2);
  });
  it('defaults to two columns', () => {
    const { container } = render(<HairlineGrid />);
    expect(container.firstElementChild?.getAttribute('data-cols')).toBe('2');
  });
});
