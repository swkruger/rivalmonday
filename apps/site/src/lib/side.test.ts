// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { PAGES } from '../../content/pages';
import { sidePaths } from '../components/shell/nav-items';
import { sideOf, switchHref } from './side';

const paths = sidePaths();

describe('sideOf', () => {
  it('/ is home', () => {
    expect(sideOf('/', paths)).toBe('home');
  });

  it("every registered path maps to its row's side", () => {
    for (const p of PAGES) {
      if (p.path === '/') continue;
      expect(sideOf(p.path, paths), p.path).toBe(p.side ?? 'both');
    }
  });

  it('an unknown path under a side prefix is both', () => {
    for (const p of ['/agencies/nope', '/business/pricing/x', '/_not-found', '/partners/x', '/compare/unknown']) expect(sideOf(p, paths), p).toBe('both');
  });

  it('a trailing slash, query or hash does not change the side', () => {
    for (const p of ['/how-it-works/', '/partners?utm=x', '/roadmap#top']) {
      expect(sideOf(p, paths), p).toBe('agency');
    }
    expect(sideOf('/?a=1', paths)).toBe('home');
  });

  it('matches a business list entry', () => {
    const lists = { agency: [], business: ['/business'] };
    expect(sideOf('/business', lists)).toBe('business');
    expect(sideOf('/business/', lists)).toBe('business');
    expect(sideOf('/business/x', lists)).toBe('both');
  });
});

describe('switchHref', () => {
  it('pricing goes to the other side pricing', () => {
    expect(switchHref('/agencies/pricing', 'business')).toBe('/business/pricing');
    expect(switchHref('/business/pricing', 'agency')).toBe('/agencies/pricing');
  });

  it('anywhere else goes to the first page of the side', () => {
    expect(switchHref('/agencies', 'business')).toBe('/business');
    expect(switchHref('/business/how-it-works', 'agency')).toBe('/agencies');
  });

  it('applies the same normalisation as sideOf', () => {
    expect(switchHref('/agencies/pricing/?x=1#y', 'business')).toBe('/business/pricing');
  });
});
