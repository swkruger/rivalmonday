// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { PRICING } from '../../content/pricing';
import { SITE_URL } from '../../content/site';
import { breadcrumbLd, faqPageLd, organizationLd, serializeJsonLd, softwareApplicationLd } from './json-ld';

function keysDeep(v: unknown, out: string[] = []): string[] {
  if (Array.isArray(v)) v.forEach((x) => keysDeep(x, out));
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { out.push(k); keysDeep(x, out); }
  return out;
}

describe('json-ld', () => {
  it('serializer escapes script break-out and line separators', () => {
    const input = '</script><b>&\u2028\u2029';
    const out = serializeJsonLd({ name: input });
    expect(out).not.toMatch(/[<>&\u2028\u2029]/);
    expect(out.toLowerCase()).not.toContain('</script');
    expect(JSON.parse(out)).toEqual({ name: input });
  });

  it('organization sameAs only when links set', () => {
    expect(organizationLd([])).not.toHaveProperty('sameAs');
    const links = ['https://www.linkedin.com/company/x'];
    const org = organizationLd(links);
    expect(org).toMatchObject({ '@type': 'Organization', url: SITE_URL, sameAs: links });
    expect(org).not.toHaveProperty('logo');
  });

  it('offers come from PRICING', () => {
    const offers = softwareApplicationLd().offers as { name: string; price: string; priceCurrency: string }[];
    expect(offers.map((o) => [o.name, o.price, o.priceCurrency])).toEqual([
      ['Agency', PRICING.agency.monthlyUsd.toFixed(2), 'USD'],
      ['Local business', PRICING.business.monthlyUsd.toFixed(2), 'USD'],
    ]);
  });

  it('no rating or review keys', () => {
    const all = [organizationLd(['https://x.com/a']), softwareApplicationLd(), faqPageLd([{ q: 'q', a: 'a' }]), breadcrumbLd([{ name: 'Home', path: '/' }])];
    const keys = keysDeep(all).map((k) => k.toLowerCase());
    expect(keys.filter((k) => /rating$|^rating|^review/.test(k)) /* not operatingSystem */).toEqual([]);
  });

  it('breadcrumb items are absolute', () => {
    const ld = breadcrumbLd([{ name: 'Home', path: '/' }, { name: 'How it works', path: '/how-it-works' }]);
    expect(ld.itemListElement).toEqual([
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE_URL}/` },
      { '@type': 'ListItem', position: 2, name: 'How it works', item: `${SITE_URL}/how-it-works` },
    ]);
  });
});
