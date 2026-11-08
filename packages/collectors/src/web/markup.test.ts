import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { jsonLdOffers, markupSha, SITE_FEATURE_REGISTRY, SITE_FEATURE_REGISTRY_VERSION, siteFeatures } from './markup';

const DIR = join(__dirname, '__fixtures__', 'markup');
const fx = (name: string) => readFileSync(join(DIR, `${name}.html`), 'utf8');
const page = (body: string) => `<!doctype html><html><body>${body}</body></html>`;

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

describe('jsonLdOffers', () => {
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
