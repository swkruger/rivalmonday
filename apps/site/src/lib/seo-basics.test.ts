// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CHOOSER } from '../../content/chooser';
import { HERO } from '../../content/home';
import { PAGES } from '../../content/pages';
import { PRICING } from '../../content/pricing';
import { BUSINESS_FAQ } from '../../content/pricing-page';
import { SOURCES } from '../../content/sources';
import { SITE_URL } from '../../content/site';
import manifest from '../app/manifest';
import { ORG_ID, faqPageLd, organizationLd, softwareApplicationLd, websiteLd } from './json-ld';
import { effectiveTitle, pageMetadata } from './metadata';
import { sourceLinks } from './source-links';

const agencyNumbers = () => {
  const a = PRICING.agency;
  const nums = [a.monthlyUsd, a.yearlyUsd, ...a.extraClientTiers.map((t) => t.usd)];
  return [...new Set(nums.flatMap((n) => [`$${n}`, `$${n.toLocaleString('en-US')}`]))];
};
const showsAmount = (text: string, f: string) => text.includes(f) && new RegExp(`${f.replace('$', '\\$')}(?![\\d,])`).test(text);
const appDir = join(__dirname, '..', 'app');
const source = (dir: string, file: string) => readFileSync(join(appDir, dir, file), 'utf8');

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

describe('SEO surfaces of the two sides', () => {
  it('SoftwareApplication is on the three decided pages and not on /business or /business/pricing', () => {
    for (const dir of ['', 'agencies', 'agencies/pricing']) expect(source(dir, 'page.tsx'), dir).toContain('softwareApplicationLd()');
    for (const dir of ['business', 'business/pricing']) expect(source(dir, 'page.tsx'), dir).not.toContain('softwareApplicationLd');
  });

  it('site-wide surfaces carry the neutral home line, not the agency stem', () => {
    expect(manifest().description).toBe(CHOOSER.eyebrow);
    expect(organizationLd([]).description).toBe(CHOOSER.eyebrow);
    expect(softwareApplicationLd().description).toBe(CHOOSER.eyebrow);
    const layout = source('', 'layout.tsx');
    expect(layout).toContain('default: `${SITE_NAME} — ${CHOOSER.eyebrow}`');
    expect(layout).not.toContain('TITLE_STEM');
  });

  it('metadata of /business and /business/pricing contains no agency stem and no agency plan number', () => {
    for (const path of ['/business', '/business/pricing'] as const) {
      const page = PAGES.find((p) => p.path === path)!;
      const texts = [JSON.stringify(pageMetadata(path)), effectiveTitle(page), source(path.slice(1), 'opengraph-image.tsx')];
      if (path === '/business/pricing') texts.push(JSON.stringify(faqPageLd(BUSINESS_FAQ)));
      for (const t of texts) {
        expect(t, path).not.toContain(HERO.eyebrow);
        for (const f of agencyNumbers()) expect(showsAmount(t, f), `${path} ${f}`).toBe(false);
      }
      expect(pageMetadata(path)).toMatchObject({ description: page.description, openGraph: { title: effectiveTitle(page), url: SITE_URL + path }, twitter: { card: 'summary_large_image' } });
    }
  });
});
