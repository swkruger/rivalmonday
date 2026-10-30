// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { SOURCES } from '../../content/sources';
import { SITE_URL } from '../../content/site';
import manifest from '../app/manifest';
import { ORG_ID, organizationLd, softwareApplicationLd, websiteLd } from './json-ld';
import { sourceLinks } from './source-links';

describe('SEO basics', () => {
  it('manifest names the site and lists the generated icons', () => {
    const m = manifest();
    expect(m.name).toBe('Rival Monday');
    expect(m.icons?.map((i) => i.src)).toEqual(['/icon', '/apple-icon']);
    expect(m.theme_color).toMatch(/^#[0-9A-F]{6}$/i);
  });

  it('organization, website and app are one connected graph', () => {
    const org = organizationLd([]);
    expect(org).toMatchObject({ '@id': ORG_ID, logo: `${SITE_URL}/apple-icon` });
    expect(org).not.toHaveProperty('sameAs');
    expect(websiteLd()).toMatchObject({ '@type': 'WebSite', url: SITE_URL, publisher: { '@id': ORG_ID } });
    expect(websiteLd()).not.toHaveProperty('potentialAction');
    expect(softwareApplicationLd()).toMatchObject({ publisher: { '@id': ORG_ID } });
    expect(JSON.stringify(softwareApplicationLd())).not.toMatch(/aggregateRating|review/i);
  });

  it('every brief kind links to a registered source page', () => {
    const links = sourceLinks();
    expect(Object.keys(links).sort()).toEqual(['ads', 'listing', 'rank', 'reviews', 'website']);
    for (const href of Object.values(links)) expect(SOURCES.map((s) => `/sources/${s.slug}`)).toContain(href);
  });
});
