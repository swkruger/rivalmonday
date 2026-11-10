// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { PAGES } from '../../content/pages';
import { REDIRECTS } from './redirects';

describe('REDIRECTS', () => {
  it('redirects /pricing permanently to /agencies/pricing', () => {
    expect(REDIRECTS).toEqual([{ source: '/pricing', destination: '/agencies/pricing', permanent: true }]);
    const [rule] = REDIRECTS;
    expect('has' in rule || 'missing' in rule).toBe(false);
  });

  it('no rule source is a registered path', () => {
    const registered = new Set<string>(PAGES.map((p) => p.path));
    for (const r of REDIRECTS) expect(registered.has(r.source), r.source).toBe(false);
    for (const r of REDIRECTS) expect(registered.has(r.destination), r.destination).toBe(true);
  });
});
