import { describe, expect, it } from 'vitest';
import { selectPages } from './select';

describe('selectPages', () => {
  it('prioritises high-signal types, caps blog pages, drops other, assigns cadence', () => {
    const pages = [
      { url: 'https://s.example/blog/1', pageType: 'blog' as const, source: 'sitemap' as const },
      { url: 'https://s.example/blog/2', pageType: 'blog' as const, source: 'sitemap' as const },
      { url: 'https://s.example/blog/3', pageType: 'blog' as const, source: 'sitemap' as const },
      { url: 'https://s.example/x', pageType: 'other' as const, source: 'nav' as const },
      { url: 'https://s.example/careers', pageType: 'careers' as const, source: 'nav' as const },
      { url: 'https://s.example/pricing', pageType: 'pricing' as const, source: 'nav' as const },
      { url: 'https://s.example/', pageType: 'home' as const, source: 'nav' as const },
    ];
    const out = selectPages(pages);
    expect(out.map((p) => p.url)).toEqual([
      'https://s.example/', 'https://s.example/pricing', 'https://s.example/careers', 'https://s.example/blog/1', 'https://s.example/blog/2',
    ]);
    expect(out.find((p) => p.pageType === 'pricing')?.cadence).toBe('daily');
    expect(out.find((p) => p.pageType === 'careers')?.cadence).toBe('weekly');
    expect(selectPages(pages, 2)).toHaveLength(2);
  });
});
