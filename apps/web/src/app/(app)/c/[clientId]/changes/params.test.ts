import { describe, expect, it } from 'vitest';
import { changesHref, parseChangesParams } from './params';

const C = '11111111-1111-4111-8111-111111111111';
const E = '22222222-2222-4222-8222-222222222222';

describe('changes params', () => {
  it('applies defaults and drops invalid values', () => {
    expect(parseChangesParams({})).toEqual({ route: 'flagged', days: 30, offset: 0, tab: 'side' });
    expect(parseChangesParams({ days: '45', route: 'weird', offset: '-3', competitor: 'not-a-uuid', tab: 'x', q: '  ' })).toEqual({ route: 'flagged', days: 30, offset: 0, tab: 'side' });
    expect(parseChangesParams({ days: '90', route: 'archive', event: E, q: ' $79 ', offset: '50' })).toEqual({ route: 'archive', days: 90, offset: 50, event: E, q: '$79', tab: 'side' });
  });
  it('builds hrefs without defaults', () => {
    expect(changesHref(C, {})).toBe(`/c/${C}/changes`);
    expect(changesHref(C, { route: 'all', days: 30, event: E, tab: 'text' })).toBe(`/c/${C}/changes?route=all&event=${E}&tab=text`);
  });
});

describe('tab=page', () => {
  it('tab=page parses; unknown tab → side', () => {
    expect(parseChangesParams({ tab: 'page' }).tab).toBe('page');
    expect(parseChangesParams({ tab: 'nope' }).tab).toBe('side');
  });
});

describe('from/to', () => {
  it('parses valid from/to; drops reversed, malformed or > 31 days', () => {
    expect(parseChangesParams({ from: '2026-10-12', to: '2026-10-18' })).toMatchObject({ from: '2026-10-12', to: '2026-10-18' });
    expect(parseChangesParams({ from: '2026-10-01', to: '2026-10-31' })).toMatchObject({ from: '2026-10-01', to: '2026-10-31' });
    const none = (sp: Record<string, string>) => {
      const p = parseChangesParams(sp);
      expect(p.from).toBeUndefined();
      expect(p.to).toBeUndefined();
    };
    none({ from: '2026-10-18', to: '2026-10-12' });
    none({ from: '2026-10-1', to: '2026-10-12' });
    none({ from: '2026-02-30', to: '2026-03-02' });
    none({ from: '2026-10-01', to: '2026-11-02' });
    none({ from: '2026-10-12' });
    none({ to: '2026-10-12' });
  });
  it('changesHref round-trips from/to', () => {
    const href = changesHref(C, { days: 7, from: '2026-10-12', to: '2026-10-18' });
    expect(href).toBe(`/c/${C}/changes?days=7&from=2026-10-12&to=2026-10-18`);
    const sp = Object.fromEntries(new URL(href, 'http://x').searchParams);
    expect(parseChangesParams(sp)).toMatchObject({ days: 7, from: '2026-10-12', to: '2026-10-18' });
  });
});
