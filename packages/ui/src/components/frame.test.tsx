// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Frame } from './frame';

afterEach(cleanup);

describe('Frame', () => {
  it('renders data-slot="frame" and keeps padding by default', () => {
    render(<Frame data-testid="f">Body</Frame>);
    const el = screen.getByTestId('f');
    expect(el.getAttribute('data-slot')).toBe('frame');
    expect(el.hasAttribute('data-flush')).toBe(false);
  });
  it('flush marks data-flush and drops padding', () => {
    render(<Frame flush data-testid="f">Body</Frame>);
    const el = screen.getByTestId('f');
    expect(el.getAttribute('data-flush')).toBe('true');
    expect(el.className).not.toMatch(/(^|\s)p-4(\s|$)/);
  });
  it('passes role and aria-label through', () => {
    render(<Frame role="group" aria-label="Things">x</Frame>);
    expect(screen.getByRole('group', { name: 'Things' }).getAttribute('data-slot')).toBe('frame');
  });
});
