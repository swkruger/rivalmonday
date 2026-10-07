import { describe, expect, it } from 'vitest';
import { normalizeAdminEmails } from './platform';

describe('normalizeAdminEmails (5b-2 decision 2)', () => {
  it('lower-cases, trims and drops blanks, malformed entries and duplicates', () => {
    expect(normalizeAdminEmails(' Op@Example.com, ,bad, x@y.co ,op@example.com')).toEqual(['op@example.com', 'x@y.co']);
    expect(normalizeAdminEmails(undefined)).toEqual([]);
    expect(normalizeAdminEmails('')).toEqual([]);
  });
});
