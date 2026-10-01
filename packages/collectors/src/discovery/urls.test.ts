import { describe, expect, it } from 'vitest';
import { guessPageType, normalizeUrl } from './urls';

describe('normalizeUrl', () => {
  const site = 'smithhvac.example';
  it.each([
    ['https://www.smithhvac.example/Pricing/?utm_source=x&b=1#top', 'https://www.smithhvac.example/Pricing?b=1'],
    ['https://smithhvac.example/', 'https://smithhvac.example/'],
    ['http://SMITHHVAC.example/services/ac/', 'http://smithhvac.example/services/ac'],
  ])('%s → %s', (input, out) => expect(normalizeUrl(input, site)).toBe(out));
  it.each(['https://other.example/', 'mailto:a@b.c', 'tel:123', 'https://smithhvac.example/brochure.pdf', 'https://smithhvac.example/logo.PNG', 'not a url'])('rejects %s', (u) =>
    expect(normalizeUrl(u, site)).toBeNull(),
  );
});

describe('guessPageType', () => {
  it.each([
    ['https://s.example/', undefined, 'home'],
    ['https://s.example/pricing', undefined, 'pricing'],
    ['https://s.example/specials', undefined, 'promo'],
    ['https://s.example/service-area/brookhaven', undefined, 'service_area'],
    ['https://s.example/careers', undefined, 'careers'],
    ['https://s.example/blog/5-signs', undefined, 'blog'],
    ['https://s.example/x', 'Our Team', 'team'],
    ['https://s.example/ac-repair', undefined, null],
  ])('%s (%s) → %s', (u, text, type) => expect(guessPageType(u, text)).toBe(type));
});
