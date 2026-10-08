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
