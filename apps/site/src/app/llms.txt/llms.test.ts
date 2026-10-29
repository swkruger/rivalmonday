// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { collectionPage, PAGES } from '../../../content/pages';
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
