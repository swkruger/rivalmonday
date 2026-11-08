import { describe, expect, it } from 'vitest';
import { pageKey } from './page-key';

describe('pageKey', () => {
  it('is scheme-free, www-free, lower-case host, sorted query', () => {
    expect(pageKey('https://Example.com/services/ac-repair?b=2&a=1')).toBe('example.com/services/ac-repair?a=1&b=2');
  });

  it('folds http/https, www/bare, trailing slashes, fragments and tracking params into one key', () => {
    const key = pageKey('https://example.com/pricing');
    for (const u of [
      'http://example.com/pricing',
      'https://www.example.com/pricing',
      'http://WWW.example.com/pricing/',
      'https://example.com/pricing//',
      'https://example.com/pricing#rates',
      'https://example.com/pricing?utm_source=x&gclid=1&fbclid=2&msclkid=3',
    ]) expect(pageKey(u)).toBe(key);
    expect(pageKey('https://example.com/')).toBe(pageKey('http://www.example.com'));
  });

  it('keeps path case and non-tracking params, and distinguishes different pages', () => {
    expect(pageKey('https://example.com/Pricing')).not.toBe(pageKey('https://example.com/pricing'));
    expect(pageKey('https://example.com/p?id=1')).not.toBe(pageKey('https://example.com/p?id=2'));
    expect(pageKey('https://example.com/p?utm_medium=a&id=1')).toBe('example.com/p?id=1');
  });

  it('returns null for unparsable or non-web urls', () => {
    expect(pageKey('not a url')).toBeNull();
    expect(pageKey('mailto:a@example.com')).toBeNull();
    expect(pageKey('ftp://example.com/x')).toBeNull();
  });
});
