// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { NumberMarker } from './number-marker';

afterEach(cleanup);

describe('NumberMarker', () => {
  it('renders n, is decorative, md = size-7, sm = size-6', () => {
    const { container, rerender } = render(<NumberMarker n={3} />);
    const el = () => container.firstElementChild as HTMLElement;
    expect(el().textContent).toBe('3');
    expect(el().getAttribute('aria-hidden')).toBe('true');
    expect(el().getAttribute('data-slot')).toBe('number-marker');
    expect(el().className).toContain('size-7');
    rerender(<NumberMarker n={3} size="sm" />);
    expect(el().className).toContain('size-6');
  });
});
