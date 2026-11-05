// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { cn } from '../lib/cn';
import { Button, buttonVariants } from './button';

const DEFAULT_BUTTON =
  "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-sm text-13 font-medium whitespace-nowrap transition-colors outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-45 aria-busy:pointer-events-none aria-invalid:border-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 bg-primary font-semibold text-primary-foreground hover:bg-primary-hover active:bg-primary-active h-9 px-3 has-[>svg]:px-2.5";

afterEach(cleanup);

describe('Button', () => {
  it.each(['default', 'outline', 'ghost', 'destructive', 'destructive-outline', 'link'] as const)(
    'variant %s renders data-variant',
    (variant) => {
      render(<Button variant={variant}>Go</Button>);
      expect(screen.getByRole('button').getAttribute('data-variant')).toBe(variant);
    },
  );

  it('ink and done carry their tone classes', () => {
    render(<Button variant="ink">Go</Button>);
    const ink = screen.getByRole('button');
    expect(ink.getAttribute('data-variant')).toBe('ink');
    expect(ink.className).toContain('bg-brand-ink');
    expect(ink.className).toContain('text-white');
    expect(cn('bg-surface', buttonVariants({ variant: 'ink' }))).toContain('bg-brand-ink');
    expect(cn('bg-surface', buttonVariants({ variant: 'ink' }))).toContain('hover:bg-brand-ink-hover');
    expect(cn('bg-surface', buttonVariants({ variant: 'ink' }))).not.toContain('bg-surface');
    cleanup();
    render(<Button variant="done">Done</Button>);
    const done = screen.getByRole('button');
    expect(done.getAttribute('data-variant')).toBe('done');
    expect(done.className).toContain('bg-success-strong');
  });

  it('the default variant string is unchanged (AS2)', () => {
    expect(buttonVariants({ variant: 'default' })).toBe(DEFAULT_BUTTON);
  });

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
