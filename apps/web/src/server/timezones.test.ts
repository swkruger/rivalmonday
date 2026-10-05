import { describe, expect, it } from 'vitest';
import { timezoneOptions } from './timezones';

describe('timezoneOptions', () => {
  it('always includes UTC and the current value, even when Intl omits them, sorted', () => {
    // Node's Intl.supportedValuesOf('timeZone') carries neither entry (confirmed on Node 24): 'UTC' is absent,
    // and the legacy alias 'Asia/Kolkata' is replaced by the canonical 'Asia/Calcutta'.
    const options = timezoneOptions('Asia/Kolkata');
    expect(options).toContain('UTC');
    expect(options).toContain('Asia/Kolkata');
    expect(options).toEqual([...options].sort());
  });

  it('does not duplicate a current value Intl already lists', () => {
    const options = timezoneOptions('America/Chicago');
    expect(options.filter((tz) => tz === 'America/Chicago')).toHaveLength(1);
  });
});
