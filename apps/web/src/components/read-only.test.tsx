// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ReadOnlyProvider, useReadOnly, WriteGuard } from './read-only';

function Flag() {
  return <span>{useReadOnly() ? 'ro' : 'rw'}</span>;
}

describe('read-only', () => {
  it('WriteGuard hides its children inside a read-only session', () => {
    render(<ReadOnlyProvider readOnly><WriteGuard><button type="button">Save</button></WriteGuard><Flag /></ReadOnlyProvider>);
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
    expect(screen.getByText('ro')).toBeTruthy();
  });

  it('WriteGuard shows its children otherwise (and without a provider)', () => {
    render(<ReadOnlyProvider readOnly={false}><WriteGuard><button type="button">Save</button></WriteGuard></ReadOnlyProvider>);
    expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy();
    render(<><WriteGuard><button type="button">Other</button></WriteGuard><Flag /></>);
    expect(screen.getByRole('button', { name: 'Other' })).toBeTruthy();
    expect(screen.getByText('rw')).toBeTruthy();
  });
});
