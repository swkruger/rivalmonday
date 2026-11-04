import { describe, expect, it } from 'vitest';
import { cookieHeaderFrom, fillKnownParams, fillsStaticSibling, medianOf, medianVisit, parseProfileArgs, routePattern, routeOfPageDir } from './profile-args';

describe('parseProfileArgs', () => {
  it('defaults to the local E2E server on E2E_PORT (3100 when unset), no cookie file, no assertion', () => {
    expect(parseProfileArgs([], {})).toEqual({ base: 'http://localhost:3100', cookie: null, assertStages: null, assertDbStages: null, strictRoutes: false, params: {}, paramsFromSeed: false, json: null });
    expect(parseProfileArgs([], { E2E_PORT: '3107' })).toMatchObject({ base: 'http://localhost:3107' });
  });
  it('takes --base (trailing slash dropped), --cookie and --assert-stages', () => {
    expect(parseProfileArgs(['--base', 'https://rivalmonday.app/', '--cookie', 'c.json', '--assert-stages', '4'], {}))
      .toEqual({ base: 'https://rivalmonday.app', cookie: 'c.json', assertStages: 4, assertDbStages: null, strictRoutes: false, params: {}, paramsFromSeed: false, json: null });
    expect(parseProfileArgs(['--assert-stages=4'], {})).toMatchObject({ assertStages: 4 });
  });
  it('takes --assert-db-stages and --strict-routes (both off by default)', () => {
    expect(parseProfileArgs(['--assert-db-stages', '12', '--strict-routes'], {})).toMatchObject({ assertDbStages: 12, strictRoutes: true, assertStages: null });
  });
  it('takes --params-from-seed and --json FILE (off by default)', () => {
    expect(parseProfileArgs(['--params-from-seed', '--json', '.profile/gate.json'], {})).toMatchObject({ paramsFromSeed: true, json: '.profile/gate.json' });
    expect(parseProfileArgs(['--json=out.json'], {})).toMatchObject({ paramsFromSeed: false, json: 'out.json' });
    expect(parseProfileArgs(['--json'], {})).toHaveProperty('error');
  });
  it('collects repeated --param name=value overrides', () => {
    expect(parseProfileArgs(['--param', 'clientId=abc', '--param', 'briefId=def'], {})).toMatchObject({ params: { clientId: 'abc', briefId: 'def' } });
    expect(parseProfileArgs(['--param', '/kb/[id]=k1'], {})).toMatchObject({ params: { '/kb/[id]': 'k1' } });
  });
  it('rejects a bad --assert-stages, a non-http base, a malformed --param and unknown flags', () => {
    expect(parseProfileArgs(['--assert-stages', 'x'], {})).toHaveProperty('error');
    expect(parseProfileArgs(['--assert-stages', '0'], {})).toHaveProperty('error');
    expect(parseProfileArgs(['--assert-db-stages', '1.5'], {})).toHaveProperty('error');
    expect(parseProfileArgs(['--base', 'ftp://x'], {})).toHaveProperty('error');
    expect(parseProfileArgs(['--param', 'clientId'], {})).toHaveProperty('error');
    expect(parseProfileArgs(['--nope'], {})).toHaveProperty('error');
  });
});

describe('routePattern', () => {
  it('matches a concrete path for a route with params and captures them by name', () => {
    const m = routePattern('/c/[clientId]/briefs/[briefId]').exec('/c/11111111-2222-3333-4444-555555555555/briefs/abc-1');
    expect(m?.groups).toEqual({ clientId: '11111111-2222-3333-4444-555555555555', briefId: 'abc-1' });
  });
  it('matches whole paths only', () => {
    expect(routePattern('/c/[clientId]').test('/c/x/briefs')).toBe(false);
    expect(routePattern('/agency/approvals/[briefId]').test('/agency/approvals')).toBe(false);
  });
  it('captures a single param', () => {
    expect(routePattern('/kb/[id]').exec('/kb/42')?.groups).toEqual({ id: '42' });
  });
});

describe('fillKnownParams', () => {
  it('fills params it knows and leaves the route unresolved when one is missing', () => {
    expect(fillKnownParams('/c/[clientId]/rankings', { clientId: 'c1' })).toBe('/c/c1/rankings');
    expect(fillKnownParams('/c/[clientId]/briefs/[briefId]', { clientId: 'c1' })).toBeNull();
    expect(fillKnownParams('/agency', {})).toBe('/agency');
  });
});

describe('cookieHeaderFrom', () => {
  it('builds a Cookie header from a Playwright storage state, keeping only cookies for the host', () => {
    const state = JSON.stringify({ cookies: [
      { name: 'better-auth.session_token', value: 'abc', domain: 'localhost' },
      { name: 'other', value: 'x', domain: 'example.com' },
      { name: 'sub', value: 'y', domain: '.rivalmonday.app' },
    ] });
    expect(cookieHeaderFrom(state, 'localhost')).toBe('better-auth.session_token=abc');
    expect(cookieHeaderFrom(state, 'rivalmonday.app')).toBe('sub=y');
  });
  it('passes a raw Cookie header through (trimmed, optional "Cookie:" prefix dropped)', () => {
    expect(cookieHeaderFrom('  a=1; b=2\n', 'x')).toBe('a=1; b=2');
    expect(cookieHeaderFrom('Cookie: a=1', 'x')).toBe('a=1');
  });
});

describe('fillsStaticSibling', () => {
  const all = ['/platform/knowledge', '/platform/knowledge/new', '/platform/knowledge/[id]', '/agency/prospects/[clientId]', '/agency/prospects/new', '/c/[clientId]/briefs/[briefId]', '/c/[clientId]/settings/ai'];
  it('refuses an id that is a literal route beside the dynamic one (new, …)', () => {
    expect(fillsStaticSibling('/platform/knowledge/[id]', { id: 'new' }, all)).toBe(true);
    expect(fillsStaticSibling('/agency/prospects/[clientId]', { clientId: 'new' }, all)).toBe(true);
  });
  it('matches the prefix with any dynamic segment standing for any other (param names may differ)', () => {
    expect(fillsStaticSibling('/c/[clientId]/briefs/[briefId]', { clientId: 'c1', briefId: 'b1' }, [...all, '/c/[id]/briefs/archive'])).toBe(false);
    expect(fillsStaticSibling('/c/[clientId]/briefs/[briefId]', { clientId: 'c1', briefId: 'archive' }, [...all, '/c/[id]/briefs/archive'])).toBe(true);
  });
  it('accepts a real id', () => {
    expect(fillsStaticSibling('/platform/knowledge/[id]', { id: 'd72aa9d4-7943-4df9-b68f-94bf8f3fc398' }, all)).toBe(false);
    expect(fillsStaticSibling('/c/[clientId]/settings/ai', { clientId: 'settings' }, all)).toBe(false); // no literal at /c/<x>
  });
});

describe('routeOfPageDir', () => {
  it('drops route groups and keeps dynamic segments; private and parallel folders are not routes', () => {
    expect(routeOfPageDir('(platform)/platform/knowledge/new')).toBe('/platform/knowledge/new');
    expect(routeOfPageDir('(app)/c/[clientId]/ask/[threadId]')).toBe('/c/[clientId]/ask/[threadId]');
    expect(routeOfPageDir('')).toBe('/');
    expect(routeOfPageDir('(app)/_parts/x')).toBeNull();
    expect(routeOfPageDir('(app)/@modal/x')).toBeNull();
  });
});

describe('medianOf / medianVisit (3 warm visits per page)', () => {
  it('takes the middle value (lower middle for an even count, 0 for none)', () => {
    expect(medianOf([9, 7, 8])).toBe(8);
    expect(medianOf([12, 8, 30])).toBe(12);
    expect(medianOf([4, 1, 3, 2])).toBe(2);
    expect(medianOf([])).toBe(0);
  });
  it('reports each metric\u2019s own median and keeps the visit at the median dbStages for detail', () => {
    const v = (dbStages: number, authStages: number, txStages: number, wallMs: number) => ({ dbStages, authStages, txStages, wallMs });
    const m = medianVisit([v(10, 1, 4, 90), v(9, 3, 4, 300), v(11, 1, 5, 80)]);
    expect(m).toMatchObject({ dbStages: 10, authStages: 1, txStages: 4, wallMs: 90 });
    expect(m.detail).toEqual(v(10, 1, 4, 90));
  });
});
