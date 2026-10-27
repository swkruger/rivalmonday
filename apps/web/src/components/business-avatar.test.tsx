// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { BusinessAvatar, initialsOf } from './business-avatar';

afterEach(cleanup);

describe('initialsOf', () => {
  it.each([
    ['Smith HVAC', 'SH'],
    ['apex', 'A'],
    ['  ', '?'],
    ['', '?'],
    ['3 Brothers Plumbing', '3B'],
    ['A & B Heating', 'AB'],
  ])('%j → %s', (name, want) => {
    expect(initialsOf(name)).toBe(want);
  });
});

describe('BusinessAvatar', () => {
  it('renders the initials in an aria-hidden span', () => {
    const { container } = render(<BusinessAvatar name="Smith HVAC" />);
    const span = container.querySelector('[data-slot="business-avatar"]')!;
    expect(span.getAttribute('aria-hidden')).toBe('true');
    expect(span.textContent).toBe('SH');
  });
});
