// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { collectionPage, PAGES } from '../../../content/pages';
import { CHOOSER } from '../../../content/chooser';
import { SITE_URL } from '../../../content/site';
import { buildLlmsTxt } from '../../lib/llms';
import { GET } from './route';

describe('llms.txt', () => {
  it('lists every sitemap page once', () => {
    const txt = buildLlmsTxt(PAGES);
    for (const p of PAGES.filter((x) => x.sitemap)) {
      expect(txt.split(`](${SITE_URL}${p.path}):`).length - 1, p.path).toBe(1);
    }
    expect(txt.startsWith('# Rival Monday\n')).toBe(true);
    expect(txt).toContain('## Pages');
  });

  it('llms.txt opens with the decided intro and lists both sides', () => {
    const txt = buildLlmsTxt(PAGES);
    const home = PAGES.find((p) => p.path === '/')!;
    const intro =
      'Rival Monday watches the competitors of local businesses using public information only and writes a weekly brief where every claim links to the evidence behind it. Agencies sell it under their own brand; local businesses get it through an agency.';
    expect(txt.split('\n').slice(0, 5)).toEqual(['# Rival Monday', '', `> ${CHOOSER.eyebrow}. ${home.description}`, '', intro]);
    for (const path of ['/', '/agencies', '/business', '/agencies/pricing', '/business/pricing']) {
      expect(txt, path).toContain(`](${SITE_URL}${path}):`);
    }
    expect(txt).not.toContain(`](${SITE_URL}/pricing):`);
    expect(txt).not.toContain('White-label competitor intelligence');
  });

  it('omits disabled rivals and non-sitemap pages', () => {
    const enabled = collectionPage('/compare', { slug: 'birdeye', title: 'Rival Monday vs Birdeye', description: 'D', crumb: 'Birdeye' });
    const txt = buildLlmsTxt([...PAGES.filter((p) => !p.path.startsWith('/compare/')), enabled, { ...enabled, path: '/compare/visualping', sitemap: false }]);
    expect(txt).toContain('/compare/birdeye');
    expect(txt).not.toContain('/compare/visualping');
    expect(txt).toContain('## Compare');
  });

  it('no data vendor names', () => {
    expect(buildLlmsTxt(PAGES)).not.toMatch(/dataforseo|apify|scrapecreators|stadia/i);
  });

  it('serves text/plain', async () => {
    const res = GET();
    expect(res.headers.get('content-type')).toBe('text/plain; charset=utf-8');
    expect(await res.text()).toBe(buildLlmsTxt(PAGES));
  });
});
