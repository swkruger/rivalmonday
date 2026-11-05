// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Card } from './card';

afterEach(cleanup);

describe('Card', () => {
  it('selected sets data-selected and does not thicken the border (no layout shift)', () => {
    const { container } = render(<Card variant="interactive" selected>x</Card>);
    const el = container.querySelector('[data-slot="card"]')!;
    expect(el.getAttribute('data-selected')).toBe('true');
    expect(el.className).not.toContain('border-2');
    expect(el.className).toContain('ring-inset');
  });

  it('raised keeps a transparent border and adds the raised shadow', () => {
    const { container } = render(<Card variant="raised">x</Card>);
    const el = container.querySelector('[data-slot="card"]')!;
    expect(el.getAttribute('data-variant')).toBe('raised');
    expect(el.className).toContain('shadow-raised');
    expect(el.className.split(' ')).toContain('border-transparent');
    expect(el.className.split(' ')).not.toContain('border-line');
  });

  it('unselected has no data-selected', () => {
    const { container } = render(<Card>x</Card>);
    expect(container.querySelector('[data-slot="card"]')!.hasAttribute('data-selected')).toBe(false);
  });
});
