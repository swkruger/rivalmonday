// @vitest-environment node
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { collectionPage, NAV_EXTRA, PAGES } from './pages';

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
    expect(nav.map((p) => p.path)).toEqual(['/how-it-works', '/compare', '/pricing', '/partners', '/roadmap']);
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

  it('paths are unique', () => {
    expect(new Set(PAGES.map((p) => p.path)).size).toBe(PAGES.length);
  });

  it('every NAV_EXTRA href is a registered path or an in-page anchor', () => {
    const paths = new Set<string>(PAGES.map((p) => p.path));
    for (const n of NAV_EXTRA) expect(paths.has(n.href) || /^\/#[a-z-]+$/.test(n.href), n.href).toBe(true);
  });
});
