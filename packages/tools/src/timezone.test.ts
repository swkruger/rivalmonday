import { describe, expect, it } from 'vitest';
import { validTimezone } from './timezone';

describe('validTimezone', () => {
  it('accepts IANA zones and UTC', () => {
    expect(validTimezone('America/Chicago')).toBe(true);
    expect(validTimezone('UTC')).toBe(true);
  });

  it('rejects abbreviations and unknown zones', () => {
    expect(validTimezone('EST')).toBe(false);
    expect(validTimezone('Not/AZone')).toBe(false);
  });
});
