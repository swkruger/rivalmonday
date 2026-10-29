// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { parseCompareList, parseSiteEnv } from './env';

describe('parseSiteEnv', () => {
  it('appUrl falls back on a non-https value', () => {
    expect(parseSiteEnv({ appUrl: 'http://rivalmonday.app' }).appUrl).toBe('https://rivalmonday.app');
    expect(parseSiteEnv({ appUrl: 'javascript:alert(1)' }).appUrl).toBe('https://rivalmonday.app');
    expect(parseSiteEnv({ appUrl: 'not a url' }).appUrl).toBe('https://rivalmonday.app');
    expect(parseSiteEnv({}).appUrl).toBe('https://rivalmonday.app');
    expect(parseSiteEnv({ appUrl: 'https://staging.rivalmonday.app/' }).appUrl).toBe('https://staging.rivalmonday.app');
    expect(parseSiteEnv({ appUrl: 'http://localhost:3000' }).appUrl).toBe('http://localhost:3000');
    expect(parseSiteEnv({ appUrl: 'http://localhost.evil.com' }).appUrl).toBe('https://rivalmonday.app');
  });

  it('clientPriceUsd defaults to 99', () => {
    expect(parseSiteEnv({}).clientPriceUsd).toBe(99);
    for (const bad of ['', '0', '-5', '12.5', 'abc', '99usd']) expect(parseSiteEnv({ clientPriceUsd: bad }).clientPriceUsd).toBe(99);
    expect(parseSiteEnv({ clientPriceUsd: '149' }).clientPriceUsd).toBe(149);
  });

  it('isProduction only for VERCEL_ENV=production', () => {
    expect(parseSiteEnv({ vercelEnv: 'production' }).isProduction).toBe(true);
    expect(parseSiteEnv({ vercelEnv: 'preview' }).isProduction).toBe(false);
    expect(parseSiteEnv({}).isProduction).toBe(false);
  });

  it('keeps only https social links and a non-empty Turnstile key', () => {
    const env = parseSiteEnv({ social: { linkedin: 'https://www.linkedin.com/company/x', x: 'http://x.com/y', youtube: '' }, turnstileSiteKey: '' });
    expect(env.social).toEqual({ linkedin: 'https://www.linkedin.com/company/x', x: null, youtube: null, facebook: null, instagram: null });
    expect(env.turnstileSiteKey).toBeNull();
    expect(parseSiteEnv({ turnstileSiteKey: ' 1x00000000000000000000AA ' }).turnstileSiteKey).toBe('1x00000000000000000000AA');
  });

  it('compare list unset is empty', () => {
    expect(parseSiteEnv({}).comparePages).toEqual([]);
    expect(parseSiteEnv({ comparePages: '' }).comparePages).toEqual([]);
    expect(parseCompareList(undefined)).toEqual([]);
  });

  it('compare list trims, lower-cases, drops junk and duplicates', () => {
    expect(parseCompareList(' BrightLocal, birdeye ,,local_falcon,visual ping,birdeye,local-falcon')).toEqual(['brightlocal', 'birdeye', 'local-falcon']);
    expect(parseSiteEnv({ comparePages: 'brightlocal,x/y' }).comparePages).toEqual(['brightlocal']);
  });
});
