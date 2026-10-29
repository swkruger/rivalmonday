// @vitest-environment node
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { NAV_EXTRA, PAGES } from './pages';

const appDir = join(__dirname, '..', 'src', 'app');
const pageFile = (path: string) => join(appDir, path === '/' ? '' : path.slice(1), 'page.tsx');

describe('page registry', () => {
  it('every page path has a page.tsx', () => {
    for (const p of PAGES) expect(existsSync(pageFile(p.path)), p.path).toBe(true);
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
