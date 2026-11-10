// @vitest-environment node
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { collectionPage, NAV_EXTRA, PAGES } from './pages';
import { REDIRECTS } from '../src/lib/redirects';
import { sidePaths } from '../src/components/shell/nav-items';

/** Fixed agency-side rows; later tasks add their rows here. Rival and integration rows are checked by group. */
const AGENCY_SIDE_FIXED = ['/agencies', '/agencies/pricing', '/compare', '/how-it-works', '/integrations', '/partners', '/roadmap'];

const appDir = join(__dirname, '..', 'src', 'app');
const pageFile = (path: string) => join(appDir, path === '/' ? '' : path.slice(1), 'page.tsx');
/** A collection item (`/compare/x`) is served by `<parent>/[param]/page.tsx`. */
const resolvesToPage = (path: string) => {
  if (existsSync(pageFile(path))) return true;
  const parent = path.slice(1).split('/').slice(0, -1).join('/');
  if (!parent || !existsSync(join(appDir, parent))) return false;
  return readdirSync(join(appDir, parent)).some((d) => /^\[[a-z]+\]$/.test(d) && existsSync(join(appDir, parent, d, 'page.tsx')));
};

/** Image file for a path: own `opengraph-image.tsx`, else the `[param]` sibling's. */
const ogFile = (path: string) => {
  if (path === '/') return join(appDir, 'opengraph-image.tsx');
  const own = join(appDir, path.slice(1), 'opengraph-image.tsx');
  if (existsSync(own)) return own;
  const parent = path.slice(1).split('/').slice(0, -1).join('/');
  if (!parent || !existsSync(join(appDir, parent))) return null;
  const dyn = readdirSync(join(appDir, parent)).find((d) => /^\[[a-z]+\]$/.test(d));
  const f = dyn ? join(appDir, parent, dyn, 'opengraph-image.tsx') : null;
  return f && existsSync(f) ? f : null;
};

describe('page registry', () => {
  it('[param] branch resolves a real dynamic route and rejects a missing one', () => {
    expect(existsSync(join(appDir, 'integrations', '[vendor]', 'page.tsx'))).toBe(true);
    expect(resolvesToPage('/integrations/stripe')).toBe(true);
    expect(resolvesToPage('/integrations')).toBe(true);
    expect(resolvesToPage('/how-it-works/stripe')).toBe(false);
  });

  it('every registered path has an opengraph-image.tsx', () => {
    for (const p of PAGES) expect(ogFile(p.path), p.path).not.toBeNull();
  });

  it('dynamic paths resolve to a [param] page', () => {
    expect(resolvesToPage('/how-it-works')).toBe(true);
    expect(resolvesToPage('/no-such-section/x')).toBe(false);
    expect(resolvesToPage('/missing-page')).toBe(false);
  });

  it('collectionPage builds a sitemap entry under its base', () => {
    const p = collectionPage('/compare', { slug: 'birdeye', title: 'T', description: 'D', crumb: 'Birdeye' });
    expect(p).toMatchObject({ path: '/compare/birdeye', group: 'compare', crumb: 'Birdeye', sitemap: true, changeFrequency: 'monthly', priority: 0.6 });
  });

  it('nav entries follow the spec order', () => {
    const nav = PAGES.filter((p) => p.nav).sort((a, b) => a.nav!.order - b.nav!.order);
    expect(nav.map((p) => p.path)).toEqual(['/how-it-works', '/compare', '/agencies/pricing', '/partners', '/roadmap']);
  });

  it('every page path has a page.tsx', () => {
    for (const p of PAGES) expect(resolvesToPage(p.path), p.path).toBe(true);
  });

  it('titles are within 60 and descriptions within 155', () => {
    for (const p of PAGES) {
      expect(p.title.length, p.path).toBeLessThanOrEqual(60);
      expect(p.description.length, p.path).toBeLessThanOrEqual(155);
    }
  });

  it('/ and /agencies carry the decided titles', () => {
    const home = PAGES.find((p) => p.path === '/')!;
    const agencies = PAGES.find((p) => p.path === '/agencies')!;
    expect(home.title).toBe('Rival Monday: see what local rivals did this week');
    expect(home.description).toBe('Rival Monday watches map rankings, reviews and ads around a local business and writes a Monday brief with the evidence behind every claim.');
    expect(home.side).toBeUndefined();
    expect(home.priority).toBe(1);
    expect(agencies).toMatchObject({
      title: 'Rival Monday: white-label competitor monitoring for agencies',
      description: 'Give your local-service clients a weekly, evidence-backed competitor brief under your own brand. Public information only, no claim without evidence.',
      side: 'agency',
      sitemap: true,
      changeFrequency: 'monthly',
      priority: 0.9,
    });
  });

  it('business-side rows are exactly /business and /business/pricing, with the decided title and description', () => {
    expect(PAGES.filter((p) => p.side === 'business').map((p) => p.path)).toEqual(['/business', '/business/pricing']);
    expect(PAGES.find((p) => p.path === '/business')).toMatchObject({
      title: 'Competitor tracking for your local business',
      description: 'A short brief every Monday on what the businesses near you changed: map rankings, reviews and ads, with the evidence one click away.',
      side: 'business',
      sitemap: true,
      changeFrequency: 'monthly',
      priority: 0.9,
    });
  });

  it('both pricing pages are rows with the decided titles, a sitemap entry and an og image', () => {
    for (const r of REDIRECTS) expect(PAGES.find((p) => (p.path as string) === r.source), r.source).toBeUndefined();
    const agency = PAGES.find((p) => p.path === '/agencies/pricing')!;
    const business = PAGES.find((p) => p.path === '/business/pricing')!;
    expect(agency).toMatchObject({ title: 'Pricing for agencies: three clients included', side: 'agency', sitemap: true, priority: 0.8, crumb: 'Pricing' });
    expect(business).toMatchObject({
      title: 'Pricing for local businesses',
      description: 'What Rival Monday costs a local business: a typical monthly price, set and billed by the agency that runs it for you, and what you get for it.',
      side: 'business',
      sitemap: true,
      priority: 0.8,
      crumb: 'Pricing',
    });
    expect(agency.description).toBe('The Rival Monday plan for agencies: what it includes, what it costs as you add clients, and how to cancel.');
    expect(business.nav).toBeUndefined();
    for (const p of [agency, business]) expect(existsSync(join(appDir, p.path.slice(1), 'opengraph-image.tsx')), p.path).toBe(true);
  });

  it('paths are unique', () => {
    expect(new Set(PAGES.map((p) => p.path)).size).toBe(PAGES.length);
  });

  it('agency-side rows are exactly the decided set', () => {
    const rivals = PAGES.filter((p) => p.group === 'compare' && p.path !== '/compare').map((p) => p.path);
    const integrations = PAGES.filter((p) => p.group === 'integrations' && p.path !== '/integrations').map((p) => p.path);
    const expected = [...AGENCY_SIDE_FIXED, ...rivals, ...integrations].sort();
    expect(PAGES.filter((p) => p.side === 'agency').map((p) => p.path).sort()).toEqual(expected);
    for (const path of [...rivals, ...integrations]) expect(PAGES.find((p) => p.path === path)?.side, path).toBe('agency');
    for (const r of REDIRECTS) expect(PAGES.find((p) => (p.path as string) === r.source), r.source).toBeUndefined();
  });

  it('sidePaths lists no disabled rival', () => {
    const registered = new Set<string>(PAGES.map((p) => p.path));
    const { agency, business } = sidePaths();
    for (const path of [...agency, ...business]) expect(registered.has(path), path).toBe(true);
    const rivals = PAGES.filter((p) => p.group === 'compare' && p.path !== '/compare').map((p) => p.path);
    expect(agency.filter((p) => p.startsWith('/compare/'))).toEqual(rivals);
  });

  it('every NAV_EXTRA href is a registered path or an in-page anchor', () => {
    const paths = new Set<string>(PAGES.map((p) => p.path));
    for (const n of NAV_EXTRA) expect(paths.has(n.href) || /^\/#[a-z-]+$/.test(n.href), n.href).toBe(true);
  });
});
