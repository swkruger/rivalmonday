import { describe, expect, it } from 'vitest';
import { cookieHeaderFrom, fillKnownParams, parseProfileArgs, routePattern } from './profile-args';

describe('parseProfileArgs', () => {
  it('defaults to the local E2E server on E2E_PORT (3100 when unset), no cookie file, no assertion', () => {
    expect(parseProfileArgs([], {})).toEqual({ base: 'http://localhost:3100', cookie: null, assertStages: null, params: {} });
    expect(parseProfileArgs([], { E2E_PORT: '3107' })).toMatchObject({ base: 'http://localhost:3107' });
  });
  it('takes --base (trailing slash dropped), --cookie and --assert-stages', () => {
    expect(parseProfileArgs(['--base', 'https://rivalmonday.app/', '--cookie', 'c.json', '--assert-stages', '4'], {}))
      .toEqual({ base: 'https://rivalmonday.app', cookie: 'c.json', assertStages: 4, params: {} });
    expect(parseProfileArgs(['--assert-stages=4'], {})).toMatchObject({ assertStages: 4 });
  });
  it('collects repeated --param name=value overrides', () => {
    expect(parseProfileArgs(['--param', 'clientId=abc', '--param', 'briefId=def'], {})).toMatchObject({ params: { clientId: 'abc', briefId: 'def' } });
    expect(parseProfileArgs(['--param', '/kb/[id]=k1'], {})).toMatchObject({ params: { '/kb/[id]': 'k1' } });
  });
  it('rejects a bad --assert-stages, a non-http base, a malformed --param and unknown flags', () => {
    expect(parseProfileArgs(['--assert-stages', 'x'], {})).toHaveProperty('error');
    expect(parseProfileArgs(['--assert-stages', '0'], {})).toHaveProperty('error');
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
