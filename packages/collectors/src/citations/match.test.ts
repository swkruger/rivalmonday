import { describe, expect, it } from 'vitest';
import type { SerpOrganicItem } from '@cs/db';
import { alsoFoundOn, type CitationBiz, cityFromAddress, isCategoryTitle, matchListing, nameHit, normaliseName, phone10, usPhones } from './match';
import { parseSerp } from '../rankings/serp';
import stage1 from './__fixtures__/citation-stage1.json';

describe('normaliseName', () => {
  it('drops legal suffixes and the city', () => {
    expect(normaliseName('ABC Plumbing & Heating, LLC', 'Dallas')).toEqual(['abc', 'plumbing', 'heating']);
  });
});

describe('nameHit (RF1)', () => {
  it('18d venue tokens are generic: exact head only', () => {
    expect(nameHit('The Event Center', 'Event Center Austin', 'Austin')).toBe(false);
    expect(nameHit('Event Center - Yelp', 'Event Center', 'Austin')).toBe(true);
    expect(nameHit('Mohawk Austin', 'Mohawk', 'Austin')).toBe(true);
  });
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

const row = (domain: string, title: string | null, description: string | null = null, listingUrl: string | null = null): SerpOrganicItem =>
  ({ rank: 1, domain, url: 'https://www.google.com/url?x', title, description, listingUrl });
const biz: CitationBiz = { name: 'ABC Plumbing LLC', phone: '(214) 555-0101', city: 'Dallas', domain: 'https://www.abcplumbing.com/' };

describe('matchListing (C6, P15, P16)', () => {
  const real = parseSerp((stage1 as any).tasks[0].result[0], 30).organic;
  const atomic: CitationBiz = { name: 'Atomic Plumbing', phone: '817-219-4790', city: 'Granbury', domain: null };

  it('real fixture: the Angi item matches angi.com with its listing url', () => {
    const m = matchListing(real, 'angi.com', atomic);
    expect(m?.url).toBe('https://angi.com/TX/Granbury');
    expect(m?.nameMatch).toBe(true);
  });

  it('real fixture: a Facebook question post is no listing, and Yelp never matches (RF3)', () => {
    expect(matchListing(real.filter((i) => i.title === 'Good, affordable plumber in Granbury?'), 'facebook.com', atomic)).toBeNull();
    expect(matchListing(real, 'yelp.com', atomic)).toBeNull();
  });

  it('m.facebook.com matches facebook.com', () => {
    expect(matchListing([row('m.facebook.com', 'ABC Plumbing - Dallas | Facebook')], 'facebook.com', biz)?.nameMatch).toBe(true);
  });

  it('name and phone beats an earlier name-only hit', () => {
    const items = [row('bbb.org', 'ABC Plumbing - Dallas', 'Call 214-555-0199', 'https://bbb.org/a'), row('bbb.org', 'ABC Plumbing - Dallas', 'Call 214-555-0101', 'https://bbb.org/b')];
    expect(matchListing(items, 'bbb.org', biz)?.url).toBe('https://bbb.org/b');
  });

  it('B3: name hit needs the city in title or snippet; phone-only is listed', () => {
    expect(matchListing([row('bbb.org', 'ABC Plumbing', 'Plumber')], 'bbb.org', biz)).toBeNull();
    expect(matchListing([row('bbb.org', 'ABC Plumbing', 'Plumber in Dallas')], 'bbb.org', biz)).not.toBeNull();
    expect(matchListing([row('bbb.org', 'Plumbing pros', 'Call (214) 555-0101')], 'bbb.org', biz)).not.toBeNull();
  });

  it('name hit with another phone gives phoneMatch false and the shown phone', () => {
    const m = matchListing([row('bbb.org', 'ABC Plumbing - Dallas', 'Call 214-555-0199')], 'bbb.org', biz);
    expect(m).toMatchObject({ phoneMatch: false, shownPhone: '2145550199' });
  });

  it('a toll-free number beside the business phone is a phone match', () => {
    const m = matchListing([row('bbb.org', 'ABC Plumbing - Dallas', '800-555-0123 or 214-555-0101')], 'bbb.org', biz);
    expect(m?.phoneMatch).toBe(true);
  });

  it('B4: phone-only with one phone and a normal title is nameMatch false', () => {
    expect(matchListing([row('bbb.org', 'Smith Heating', 'Call 214-555-0101')], 'bbb.org', biz)?.nameMatch).toBe(false);
  });

  it('B4: a category title or two phones leave nameMatch null', () => {
    expect(matchListing([row('bbb.org', 'Best Plumbers in Dallas', 'Call 214-555-0101')], 'bbb.org', biz)?.nameMatch).toBeNull();
    expect(matchListing([row('bbb.org', 'Smith Heating', '214-555-0101 and 214-555-0188')], 'bbb.org', biz)?.nameMatch).toBeNull();
  });

  it('a toll-free-only other phone claims nothing', () => {
    const m = matchListing([row('bbb.org', 'ABC Plumbing - Dallas', 'Call 800-555-0123')], 'bbb.org', biz);
    expect(m).toMatchObject({ phoneMatch: null, shownPhone: null });
  });

  it('isCategoryTitle', () => {
    for (const t of ['Top 10 Plumbers Near Dallas', 'Plumbers near me', 'Best Rated HVAC Contractors', '10 Best Plumbers in Dallas', 'HVAC Contractors in Dallas, TX']) expect(isCategoryTitle(t)).toBe(true);
    expect(isCategoryTitle('ABC Plumbing in Dallas')).toBe(false);
  });

  it('no phone in the snippet gives phoneMatch null', () => {
    expect(matchListing([row('bbb.org', 'ABC Plumbing - Dallas')], 'bbb.org', biz)?.phoneMatch).toBeNull();
  });

  it('banned hosts never match', () => {
    expect(matchListing([row('yelp.com', 'ABC Plumbing - Dallas', '214-555-0101')], 'yelp.com', biz)).toBeNull();
  });
});

describe('alsoFoundOn (C12)', () => {
  const both = (d: string, extra = '') => row(d, 'ABC Plumbing - Dallas', `Call 214-555-0101 ${extra}`, `https://${d}/x`);

  it('needs name and phone', () => {
    expect(alsoFoundOn([row('foo.com', 'ABC Plumbing - Dallas', 'no phone')], [], biz)).toEqual([]);
    expect(alsoFoundOn([row('foo.com', 'Other Co', 'Call 214-555-0101')], [], biz)).toEqual([]);
  });

  it('includes an uncatalogued directory with both', () => {
    expect(alsoFoundOn([both('chamberofcommerce.com')], ['bbb.org'], biz)).toEqual([{ host: 'chamberofcommerce.com', url: 'https://chamberofcommerce.com/x', title: 'ABC Plumbing - Dallas' }]);
  });

  it('excludes own domain, google, youtube, banned and catalogue subdomains', () => {
    const items = ['abcplumbing.com', 'maps.google.com', 'youtube.com', 'yelp.com', 'm.facebook.com'].map((d) => both(d));
    expect(alsoFoundOn(items, ['facebook.com'], biz)).toEqual([]);
  });

  it('caps at 10 hosts, one per host', () => {
    const items = [...Array.from({ length: 12 }, (_, i) => both(`d${i}.com`)), both('d0.com')];
    const out = alsoFoundOn(items, [], biz);
    expect(out).toHaveLength(10);
    expect(new Set(out.map((o) => o.host)).size).toBe(10);
  });
});
