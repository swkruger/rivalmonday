// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Button } from '../components/button';
import { FridayBadge } from '../components/friday-badge';
import { cn } from './cn';

afterEach(cleanup);

describe('cn knows the custom theme keys', () => {
  it('keeps text-13 next to a text colour', () => {
    expect(cn('text-13 text-ink')).toBe('text-13 text-ink');
  });
  it('keeps text-11 next to a text colour', () => {
    expect(cn('text-11 text-amber-text')).toBe('text-11 text-amber-text');
  });
  it('still resolves a font-size conflict', () => {
    expect(cn('text-13 text-sm')).toBe('text-sm');
  });
  it('resolves shadow-overlay / shadow-dialog against built-in shadows', () => {
    expect(cn('shadow-overlay shadow-none')).toBe('shadow-none');
    expect(cn('shadow-sm shadow-dialog')).toBe('shadow-dialog');
  });
  it('the default Button keeps text-13', () => {
    render(<Button>Go</Button>);
    expect(screen.getByRole('button').className.split(' ')).toContain('text-13');
  });
  it('FridayBadge size="label" keeps text-amber-text', () => {
    render(<FridayBadge size="label" />);
    expect(screen.getByText('Friday').className.split(' ')).toContain('text-amber-text');
  });
});
