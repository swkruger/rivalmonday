import { describe, expect, it } from 'vitest';
import { buildRenamer, DEMO_PLACES, DEMO_REAL_BUSINESS_WORDS, DEMO_ZIPS, FICTIONAL, guard, STATE_TERMS } from './rename';

const src = {
  client: 'Lone Star Cooling',
  businesses: ['Lake Granbury Heating & Air', 'Hill Country Air & Heat'],
  places: ['Granbury', 'Acton'],
  domains: ['lake-granbury-heating-and-air.example', 'hill-country-air-and-heat.example'],
};
const mk = () => buildRenamer(src);
const many = (n: number) => Array.from({ length: n }, (_, i) => `X${i}`);

describe('buildRenamer', () => {
  it('longest term wins', () => {
    const r = mk();
    const biz = r.terms.get('Lake Granbury Heating & Air')!;
    expect(r.apply('Lake Granbury Heating & Air opened')).toBe(`${biz} opened`);
  });
  it('lowercase keyword keeps lowercase', () => {
    const r = mk();
    expect(r.apply('ac repair granbury')).toBe(`ac repair ${r.terms.get('Granbury')!.toLowerCase()}`);
  });
  it('replacements are not re-scanned', () => {
    const r = buildRenamer({ client: 'C', businesses: [], places: ['Alpha', 'Beta'], domains: [] });
    const [a, b] = [r.terms.get('Alpha')!, r.terms.get('Beta')!];
    expect(r.apply('Alpha Beta Alpha')).toBe(`${a} ${b} ${a}`);
    expect(r.apply(r.apply('Alpha'))).toBe(a); // idempotent: output holds no source term
  });
  it('domain follows its business', () => {
    const r = mk();
    const biz = r.terms.get('Hill Country Air & Heat')!;
    expect(r.terms.get('hill-country-air-and-heat.example')).toBe(`${biz.toLowerCase().replace(/ /g, '-')}.example`);
  });
  it('phones and ZIPs replaced', () => {
    const r = mk();
    expect(r.apply('Call (817) 555-0142 or 817-555-0142')).toBe('Call (555) 010-0100 or (555) 010-0100');
    expect(r.apply('ZIP 76048')).toBe('ZIP 00000');
    expect(r.apply('price $12345')).toBe('price $12345');
  });
  it('30 businesses and 30 places get unique stable names; the 121st throws', () => {
    const biz = many(30);
    const places = many(30).map((s) => `P${s}`);
    const a = buildRenamer({ client: 'C', businesses: biz, places, domains: [] });
    const b = buildRenamer({ client: 'C', businesses: [...biz].reverse(), places: [...places].reverse(), domains: [] });
    expect(new Set(biz.map((x) => a.terms.get(x))).size).toBe(30);
    expect(new Set(places.map((x) => a.terms.get(x))).size).toBe(30);
    expect(biz.map((x) => b.terms.get(x))).toEqual(biz.map((x) => a.terms.get(x)));
    expect(() => buildRenamer({ client: 'C', businesses: many(120), places: [], domains: [] })).not.toThrow();
    expect(() => buildRenamer({ client: 'C', businesses: many(121), places: [], domains: [] })).toThrow(/more than 120 businesses/);
    expect(() => buildRenamer({ client: 'C', businesses: [], places: many(121), domains: [] })).toThrow(/more than 120 places/);
  });
  it('state rule', () => {
    const r = mk();
    const place = r.terms.get('Granbury')!;
    const out = r.apply('Granbury, TX 76048');
    expect(out).toBe(`${place} 00000`);
    expect(r.apply('Texas')).toBe(STATE_TERMS.Texas);
    expect(r.apply('North Texas')).toBe(`North ${FICTIONAL.state}`);
    expect(r.apply('tx')).toBe(FICTIONAL.stateCode.toLowerCase());
    expect(guard([out, r.apply('Texas, North Texas, tx')], [], new Set())).toEqual([]);
  });
  it('neighbouring derived names use different tails and all 120 stay distinct', () => {
    const r = buildRenamer({ client: 'C', businesses: many(120), places: [], domains: [] });
    const names = [...new Set(many(120))].sort().map((s) => r.terms.get(s)!);
    expect(new Set(names).size).toBe(120);
    const tails = names.slice(0, 5).map((n) => FICTIONAL.businessTails.find((t) => n.endsWith(t)));
    expect(new Set(tails).size).toBe(5);
  });
  it('throws on a collision', () => {
    expect(() => buildRenamer({ client: 'C', businesses: ['Copperleaf Comfort Co'], places: [], domains: [] })).toThrow(/collides/);
  });
});

describe('guard', () => {
  const g = (v: unknown, deny: string[] = [], allow: string[] = []) => guard(v, deny, new Set(allow));
  it('flags a surviving term, uuid, email, phone (also beside the placeholder), street, state and unknown domain', () => {
    expect(g({ a: 'Visit Granbury' }, ['Granbury'])).toEqual([{ path: '$.a', reason: 'term:Granbury' }]);
    expect(g(['x', '3f2b8c1e-1234-4abc-8def-0123456789ab'])).toEqual([{ path: '$[1]', reason: 'uuid' }]);
    expect(g({ e: 'mail bob@acme.example' }, [], ['acme.example'])).toEqual([{ path: '$.e', reason: 'email' }]);
    expect(g({ p: 'call 817-555-0142' })).toEqual([{ path: '$.p', reason: 'phone' }]);
    expect(g({ p: '(555) 010-0100 or 817-555-0142' })).toEqual([{ path: '$.p', reason: 'phone' }]);
    expect(g({ p: '(555) 010-0100' })).toEqual([]);
    expect(g({ s: 'at 101 Pearl St' })).toEqual([{ path: '$.s', reason: 'street' }]);
    expect(g({ t: 'Granbury, TX' })).toEqual([{ path: '$.t', reason: 'state' }]);
    expect(g({ t: 'in Texas' })).toEqual([{ path: '$.t', reason: 'state' }]);
    expect(g({ d: 'see acme.com' })).toEqual([{ path: '$.d', reason: 'domain:acme.com' }]);
    expect(g({ d: 'see acme.example' }, [], ['acme.example'])).toEqual([]);
  });
  it('street rule is case-insensitive, takes directionals and route numbers', () => {
    for (const s of ['208 N Houston St', '1105 E Pearl St', '412 cedar creek rd', '14 Paluxy Road', 'FM 51', 'Hwy 377', 'US-377']) {
      expect(g({ s: `at ${s}` }).map((h) => h.reason), s).toContain('street');
    }
    expect(g({ s: 'Up 12 percent in 3 weeks, 4.8 stars' })).toEqual([]);
  });
  it('ordinary prose is not a street or route', () => {
    for (const s of ['3 new patients per Dr. Lee', 'Top 3 moves drive calls', '5 ways to drive growth', '50% of the way', '12 St. Patrick\'s Day promos', 'US 2026 trends', 'US 100 agencies']) {
      expect(g({ s }), s).toEqual([]);
    }
    expect(g({ s: 'at 9 Oak Lane' }).map((h) => h.reason)).toContain('street');
    expect(g({ s: 'on US-377 and US Hwy 67' }).map((h) => h.reason)).toContain('street');
  });
  it('seed street addresses are renamed and pass the guard', () => {
    const r = buildRenamer({ client: 'Lone Star Cooling', businesses: [], places: [...DEMO_PLACES], domains: [] });
    for (const addr of ['14 Paluxy Rd, Tolar, TX 76476', '412 Cedar Creek Rd, Granbury, TX 76048']) {
      expect(guard(r.apply(addr), [...DEMO_PLACES, ...DEMO_ZIPS], new Set()), addr).toEqual([]);
    }
  });
  it('checks object keys, multi-word spacing, bare TX / Texans, .test domains and phone forms', () => {
    expect(g({ 'Granbury Pros': 'x' }, ['Granbury'])).toEqual([{ path: '$.<key:Granbury Pros>', reason: 'term:Granbury' }]);
    for (const v of ['Lone  Star', 'Lone\nStar', 'Lone Star']) expect(g({ a: v }, ['Lone Star']).map((h) => h.reason)).toEqual(['term:Lone Star']);
    expect(g({ a: 'Based in TX' }).map((h) => h.reason)).toContain('state');
    expect(g({ a: 'Texans love AC' }).map((h) => h.reason)).toContain('state');
    expect(g({ a: 'demo.rivalmonday.test' }).map((h) => h.reason)).toEqual(['domain:rivalmonday.test']);
    for (const p of ['817.555.0142', '+1 817 555 0142', '8175550142', '(817) 555-0142']) expect(g({ p }).map((h) => h.reason), p).toContain('phone');
    expect(g({ a: '2026-10-29, 12,345 reviews, $12345' })).toEqual([]);
  });
  it('seed ZIPs are denied as terms', () => {
    expect(g({ z: 'ZIP 76048' }, [...DEMO_ZIPS]).map((h) => h.reason)).toEqual(['term:76048']);
  });
  it('every seed place is renamed (no throw, none survive) and every seed business word is denied by the guard', () => {
    const r = buildRenamer({ client: 'Lone Star Cooling', businesses: [], places: [...DEMO_PLACES], domains: [] });
    const out = r.apply(`${DEMO_PLACES.join(' | ')} 76048 208 N Houston St`);
    expect(guard(out, [...DEMO_PLACES, ...DEMO_ZIPS], new Set())).toEqual([]);
    for (const w of DEMO_REAL_BUSINESS_WORDS) expect(g({ a: `the ${w} crew` }, [...DEMO_REAL_BUSINESS_WORDS]).length, w).toBeGreaterThan(0);
  });
  it('passes clean fictional output', () => {
    const r = mk();
    const deny = [...r.terms.keys()].filter((k) => !k.includes('.'));
    const out = r.apply('Lone Star Cooling vs Lake Granbury Heating & Air in Acton, TX 76048. Call 817-555-0142. See hill-country-air-and-heat.example');
    const allow = new Set([...r.terms.values()].filter((v) => v.endsWith('.example')));
    expect(guard({ out }, deny, allow)).toEqual([]);
  });
});
