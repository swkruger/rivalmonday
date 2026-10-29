import { describe, expect, it } from 'vitest';
import { allowedOrigin, siteJoinUrl } from './site-origin';

const allowed = ['https://rivalmonday.com', 'https://www.rivalmonday.com'];

describe('allowedOrigin', () => {
  it('exact match only', () => {
    expect(allowedOrigin('https://rivalmonday.com', allowed)).toBe('https://rivalmonday.com');
    expect(allowedOrigin('https://rivalmonday.com.evil.com', allowed)).toBeNull();
    expect(allowedOrigin('https://evil.com/https://rivalmonday.com', allowed)).toBeNull();
    expect(allowedOrigin('https://rivalmonday.com/', allowed)).toBeNull();
    expect(allowedOrigin(null, allowed)).toBeNull();
  });
});

describe('siteJoinUrl', () => {
  it('uses the first site origin, else the production default', () => {
    expect(siteJoinUrl({ siteOrigins: ['https://staging.rivalmonday.com'] })).toBe('https://staging.rivalmonday.com/#join');
    expect(siteJoinUrl({ siteOrigins: [] })).toBe('https://rivalmonday.com/#join');
  });
});
