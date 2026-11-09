import { describe, expect, it } from 'vitest';
import { libraryUrl } from './library-url';

describe('libraryUrl', () => {
  it('escapes ids and has no Google link without an advertiser id', () => {
    expect(libraryUrl({ platform: 'meta', externalId: 'a b', advertiserId: null })).toBe('https://www.facebook.com/ads/library/?id=a%20b');
    expect(libraryUrl({ platform: 'google', externalId: 'g', advertiserId: null })).toBeNull();
  });
});
