// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { BulkBar, bulkBarActionClass } from './bulk-bar';

afterEach(cleanup);

describe('BulkBar', () => {
  it('is a named toolbar with its children and data-slot', () => {
    render(
      <BulkBar label="Selected suggestions">
        <button className={bulkBarActionClass}>Track selected (2)</button>
      </BulkBar>,
    );
    const bar = screen.getByRole('toolbar', { name: 'Selected suggestions' });
    expect(bar.getAttribute('data-slot')).toBe('bulk-bar');
    expect(screen.getByRole('button', { name: 'Track selected (2)' })).toBeTruthy();
  });
});
