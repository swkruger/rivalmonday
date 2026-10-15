import { describe, expect, it } from 'vitest';
import { sourceStatusLabel } from './source-status';

describe('sourceStatusLabel', () => {
  it('maps source statuses to readable labels', () => {
    expect(sourceStatusLabel('ok')).toBe('');
    expect(sourceStatusLabel('not_found')).toBe('Not found');
    expect(sourceStatusLabel('vendor_error')).toBe('Data provider error');
    expect(sourceStatusLabel('skipped')).toBe('Not set up');
    expect(sourceStatusLabel('post_failed')).toBe('Retrying');
    expect(sourceStatusLabel(null)).toBe('');
    expect(sourceStatusLabel('some_new_status')).toBe('Some new status');
  });
});
