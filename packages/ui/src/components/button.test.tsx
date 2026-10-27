// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Button } from './button';

afterEach(cleanup);

describe('Button', () => {
  it.each(['default', 'outline', 'ghost', 'destructive', 'destructive-outline', 'link'] as const)(
    'variant %s renders data-variant',
    (variant) => {
      render(<Button variant={variant}>Go</Button>);
      expect(screen.getByRole('button').getAttribute('data-variant')).toBe(variant);
    },
  );

  it('size sm renders data-size', () => {
    render(<Button size="sm">Go</Button>);
    expect(screen.getByRole('button').getAttribute('data-size')).toBe('sm');
  });

  it('disabled button is disabled and dims to 45%', () => {
    render(<Button disabled>Go</Button>);
    const b = screen.getByRole('button') as HTMLButtonElement;
    expect(b.disabled).toBe(true);
    expect(b.className).toContain('disabled:opacity-45');
  });

  it('removed variants and sizes are type errors', () => {
    // @ts-expect-error secondary was removed
    render(<Button variant="secondary">Go</Button>);
    // @ts-expect-error xs was removed
    render(<Button size="xs">Go</Button>);
    // @ts-expect-error icon-xs was removed
    render(<Button size="icon-xs">Go</Button>);
  });
});
