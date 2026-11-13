import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { jsonLdEvents, jsonLdOffers, markupSha, SITE_FEATURE_REGISTRY, SITE_FEATURE_REGISTRY_VERSION, siteFeatures } from './markup';

const DIR = join(__dirname, '__fixtures__', 'markup');
const fx = (name: string) => readFileSync(join(DIR, `${name}.html`), 'utf8');
const page = (body: string) => `<!doctype html><html><body>${body}</body></html>`;
const EVENT_FX = readFileSync(join(__dirname, '__fixtures__', 'event-jsonld.html'), 'utf8');
const ld = (o: unknown) => page(`<script type="application/ld+json">${JSON.stringify(o)}</script>`);

describe('site feature registry', () => {
  it('has a version and unique ids, with no call tracking', () => {
    expect(SITE_FEATURE_REGISTRY_VERSION).toBe(1);
    const ids = SITE_FEATURE_REGISTRY.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(SITE_FEATURE_REGISTRY.every((s) => ['online_booking', 'live_chat', 'financing', 'review_widget'].includes(s.category))).toBe(true);
  });

  it('has a fixture for every entry and none extra', () => {
    const files = readdirSync(DIR).filter((f) => !f.startsWith('jsonld-')).map((f) => f.replace(/\.html$/, '')).sort();
    expect(files).toEqual(SITE_FEATURE_REGISTRY.map((s) => s.id).sort());
  });

  for (const sig of SITE_FEATURE_REGISTRY) {
    it(`fixture ${sig.id} detects exactly ${sig.id}`, () => {
      const found = siteFeatures(fx(sig.id));
      expect(found.map((f) => f.id)).toEqual([sig.id]);
      expect(found[0]).toMatchObject({ category: sig.category, vendor: sig.vendor });
    });
  }
});

describe('siteFeatures', () => {
  it('matches on host suffix only', () => {
    expect(siteFeatures(page('<script src="https://connect.podium.com/w.js"></script>')).map((f) => f.id)).toEqual(['podium']);
    expect(siteFeatures(page('<script src="https://notpodium.com/w.js"></script>'))).toEqual([]);
    expect(siteFeatures(page('<script src="https://podium.com.evil.io/w.js"></script>'))).toEqual([]);
  });
  it('ignores relative urls and inline script text', () => {
    expect(siteFeatures(page('<script src="/podium.js"></script>'))).toEqual([]);
    expect(siteFeatures(page('<script>var s="https://connect.podium.com/w.js"; Podium.init()</script>'))).toEqual([]);
  });
  it('only reads <a> for entries that list it', () => {
    expect(siteFeatures(page('<a href="https://calendly.com/acme">Book</a>')).map((f) => f.id)).toEqual(['calendly']);
    expect(siteFeatures(page('<a href="https://connect.podium.com/x">Chat</a>'))).toEqual([]);
  });
  it('applies the jobber path rule', () => {
    expect(siteFeatures(page('<a href="https://www.getjobber.com/pricing">Jobber</a>'))).toEqual([]);
  });
  it('is unique by id and sorted', () => {
    const html = page(
      '<script src="https://widget.intercom.io/a"></script><script src="https://js.intercomcdn.com/b.js"></script><script src="//code.tidio.co/x.js"></script>',
    );
    expect(siteFeatures(html).map((f) => f.id)).toEqual(['intercom', 'tidio']);
  });
});

describe('siteFeatures inert content', () => {
  it('ignores commented-out embeds', () => {
    expect(siteFeatures(page('<!-- <script src="https://connect.podium.com/w.js"></script> -->'))).toEqual([]);
  });
  it('ignores tag-shaped text in script, style and noscript bodies, but still sees real embeds', () => {
    const html = page(
      `<script>document.write('<script src="https://connect.podium.com/w.js"></script>')</script><style>/* <script src="https://embed.tawk.to/x"> */</style><noscript><iframe src="https://widget.intercom.io/a"></iframe></noscript><script src="https://code.tidio.co/x.js"></script>`,
    );
    expect(siteFeatures(html).map((f) => f.id)).toEqual(['tidio']);
  });
  it('stays linear on large unclosed input', () => {
    const t0 = Date.now();
    siteFeatures('<script src="x" '.repeat(50000));
    jsonLdOffers('<script type="application/ld+json">'.repeat(50000));
    siteFeatures('<a '.repeat(100000));
    expect(Date.now() - t0).toBeLessThan(1000);
  });
});

describe('siteFeatures tag syntax', () => {
  it('closes scripts written </script > and </script\n>', () => {
    for (const close of ['</script >', '</script\n>']) {
      const html = page(`<script>x${close}<script src="https://embed.tawk.to/x"></script>`);
      expect(siteFeatures(html).map((f) => f.id)).toEqual(['tawk_to']);
    }
  });
  it('keeps src after a > inside a quoted attribute value', () => {
    const html = page('<script data-x="a>b" src="https://embed.tawk.to/x"></script>');
    expect(siteFeatures(html).map((f) => f.id)).toEqual(['tawk_to']);
  });
});

describe('jsonLdOffers', () => {
  it('accepts a type with parameters and case variants', () => {
    const html = page('<script type="Application/LD+JSON; charset=utf-8">{"@type":"Offer","price":5}</script>');
    expect(jsonLdOffers(html)).toHaveLength(1);
  });
  it('finds a Product offer under @graph with the inherited name', () => {
    const offers = jsonLdOffers(fx('jsonld-graph'));
    expect(offers).toEqual([
      { type: 'Offer', name: 'Tune-up', description: 'Annual furnace tune-up', price: '89.00', lowPrice: null, currency: 'USD', hasPriceSpecification: false },
    ]);
  });
  it('skips broken JSON and reads AggregateOffer', () => {
    const offers = jsonLdOffers(fx('jsonld-broken'));
    expect(offers).toHaveLength(1);
    expect(offers[0]).toMatchObject({ type: 'AggregateOffer', name: 'Install', lowPrice: 4500, hasPriceSpecification: true });
  });
  it('surfaces a missing currency as null and caps at 50', () => {
    const many = Array.from({ length: 80 }, (_, i) => ({ '@type': 'Offer', price: i }));
    const html = page(`<script type='application/ld+json'>${JSON.stringify(many)}</script>`);
    const offers = jsonLdOffers(html);
    expect(offers).toHaveLength(50);
    expect(offers[0]!.currency).toBeNull();
  });
});

describe('markupSha', () => {
  it('is stable under attribute order and whitespace', () => {
    const a = page('<script async src="https://embed.tawk.to/x"></script>');
    const b = page('\n  <script   src="https://embed.tawk.to/x"   async ></script>\n');
    expect(markupSha(a)).toBe(markupSha(b));
    expect(markupSha(a)).toMatch(/^[0-9a-f]{64}$/);
  });
  it('differs when a widget is added or an offer changes', () => {
    const base = page('<p>hi</p>');
    const withWidget = page('<p>hi</p><script src="https://embed.tawk.to/x"></script>');
    expect(markupSha(withWidget)).not.toBe(markupSha(base));
    const o = (p: number) => page(`<script type="application/ld+json">{"@type":"Offer","price":${p},"priceCurrency":"USD"}</script>`);
    expect(markupSha(o(89))).not.toBe(markupSha(o(99)));
  });
  it('ignores text changes', () => {
    expect(markupSha(page('<p>one</p>'))).toBe(markupSha(page('<p>two</p>')));
  });
});

describe('jsonLdEvents', () => {
  it('reads MusicEvent, Festival and a graph Event, ignoring a Product offer', () => {
    expect(jsonLdEvents(EVENT_FX)).toEqual([
      {
        name: 'Summer Jazz Night',
        startDate: '2026-07-18T19:30:00-05:00',
        endDate: '2026-07-18T22:00:00-05:00',
        status: 'https://schema.org/EventCancelled',
        soldOut: false,
        ticketed: true,
        url: 'https://lakesidehall.example/events/jazz-night',
        venue: 'Lakeside Hall',
      },
      { name: 'Harvest Fest', startDate: '2026-10-03', endDate: null, status: null, soldOut: false, ticketed: false, url: null, venue: 'Town Green' },
      { name: 'Open Mic', startDate: '2026-08-05T18:00', endDate: null, status: 'EventPostponed', soldOut: false, ticketed: false, url: null, venue: null },
    ]);
  });
  it('flags a sold-out offer on a scheduled event', () => {
    const [e] = jsonLdEvents(
      ld({ '@type': 'Event', name: 'Gala', startDate: '2026-09-01', eventStatus: 'https://schema.org/EventScheduled', offers: { '@type': 'Offer', price: 0, availability: 'https://schema.org/SoldOut' } }),
    );
    expect(e).toMatchObject({ status: 'https://schema.org/EventScheduled', soldOut: true, ticketed: false });
  });
  it('needs name and startDate, and does not double count nested events', () => {
    expect(jsonLdEvents(ld({ '@type': 'Event', name: 'No date' }))).toEqual([]);
    const nested = jsonLdEvents(ld({ '@type': 'Event', name: 'Parent', startDate: '2026-09-01', subEvent: { '@type': 'Event', name: 'Child', startDate: '2026-09-01' } }));
    expect(nested.map((e) => e.name)).toEqual(['Parent']);
  });
  it('caps at 50 and skips broken JSON blocks', () => {
    const many = Array.from({ length: 60 }, (_, i) => ({ '@type': 'Event', name: `E${i}`, startDate: '2026-09-01' }));
    const html = page(`<script type="application/ld+json">{oops</script><script type="application/ld+json">${JSON.stringify(many)}</script>`);
    expect(jsonLdEvents(html)).toHaveLength(50);
  });
  it('changes markupSha only when an event changes', () => {
    const ev = (status: string) => ld({ '@type': 'Event', name: 'Gala', startDate: '2026-09-01', eventStatus: status });
    expect(markupSha(ev('EventScheduled'))).not.toBe(markupSha(ev('EventCancelled')));
    expect(markupSha(ev('EventScheduled'))).toBe(markupSha(ev('EventScheduled')));
  });
});
