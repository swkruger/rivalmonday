import { describe, expect, it } from 'vitest';
import { cityFromAddress, normaliseName, nameHit, phone10, usPhones } from './match';

describe('normaliseName', () => {
  it('drops legal suffixes and the city', () => {
    expect(normaliseName('ABC Plumbing & Heating, LLC', 'Dallas')).toEqual(['abc', 'plumbing', 'heating']);
  });
});

describe('nameHit (RF1)', () => {
  it('generic-name needs exact head', () => {
    expect(nameHit('Dallas Plumbing Co - Dallas, TX', 'Dallas Plumbing', 'Dallas')).toBe(true);
    expect(nameHit('Plumbing Services in Dallas, TX', 'Dallas Plumbing', 'Dallas')).toBe(false);
  });

  it('category page is no hit', () => {
    expect(nameHit('Best Plumbers in Dallas, TX - Updated 2026', 'ABC Plumbing', 'Dallas')).toBe(false);
  });

  it('matches a distinctive name followed by an address in the title', () => {
    expect(nameHit('ABC Plumbing 123 Main St, Dallas, TX 75201 - YP.com', 'ABC Plumbing LLC', 'Dallas')).toBe(true);
  });

  it('matches the reverse direction for a distinctive listing title', () => {
    expect(nameHit('Smith Dental Care | Facebook', 'Smith Family Dental Care PLLC', null)).toBe(true);
    expect(nameHit('Smith | Facebook', 'Smith Plumbing', null)).toBe(false);
  });

  it('returns false for a null or empty title', () => {
    expect(nameHit(null, 'ABC Plumbing', 'Dallas')).toBe(false);
    expect(nameHit('', 'ABC Plumbing', 'Dallas')).toBe(false);
  });

  it('qualifier words are generic: a longer qualified listing is not a hit (fix 1)', () => {
    expect(nameHit('Emergency Plumbing Services in Dallas, TX', 'Dallas Emergency Plumbing', 'Dallas')).toBe(false);
    expect(nameHit('Texas Plumbing Association', 'Texas Plumbing', 'Dallas')).toBe(false);
  });

  it('state names and abbreviations are generic (fix 1)', () => {
    expect(nameHit('Florida Dental Care | Yelp', 'Florida Dental', 'Tampa')).toBe(false);
    expect(nameHit('TX Plumbing Services - Yelp', 'TX Plumbing', 'Dallas')).toBe(false);
    expect(nameHit('TX Plumbing - Yelp', 'TX Plumbing', 'Dallas')).toBe(true);
  });

  it('generic-only name hits the exact head before city stripping (fix 2)', () => {
    expect(nameHit('Dallas Plumbing - Yelp', 'Dallas Plumbing', 'Dallas')).toBe(true);
    expect(nameHit('Plumbing - Dallas, TX - Yelp', 'Dallas Plumbing', 'Dallas')).toBe(false);
    expect(nameHit('Plumbing | Angi', 'Dallas Plumbing', 'Dallas')).toBe(false);
  });
});

describe('phone helpers (RF2)', () => {
  it('usPhones normalises every US format to 10 digits', () => {
    expect(usPhones('(214) 555-0101')).toEqual(['2145550101']);
    expect(usPhones('214.555.0101')).toEqual(['2145550101']);
    expect(usPhones('+1 214-555-0101')).toEqual(['2145550101']);
    expect(usPhones('2145550101')).toEqual(['2145550101']);
  });

  it('usPhones ignores addresses and zip codes', () => {
    expect(usPhones('TX 75201, Suite 214, 555 Elm')).toEqual([]);
  });

  it('phone10 strips the country code', () => {
    expect(phone10('+1 (214) 555-0101')).toBe('2145550101');
  });

  it('phone10 rejects numbers without an area code', () => {
    expect(phone10('555-0101')).toBeNull();
  });

  it('phone10 applies the [2-9] area-code rule (fix 3)', () => {
    expect(phone10('1234567890')).toBeNull();
    expect(phone10('11234567890')).toBeNull();
  });

  it('usPhones rejects an unformatted number with a trailing dash (fix 3)', () => {
    expect(usPhones('ref 2145550101-44')).toEqual([]);
    expect(usPhones('1234567890')).toEqual([]);
  });
});

describe('cityFromAddress (P5)', () => {
  it('takes the city before the state and zip, dropping the country', () => {
    expect(cityFromAddress('9 Oak Ave, Granbury, TX 76048, United States')).toBe('Granbury');
  });

  it('returns null when there is no state segment', () => {
    expect(cityFromAddress('9 Oak Ave')).toBeNull();
    expect(cityFromAddress(null)).toBeNull();
  });
});
