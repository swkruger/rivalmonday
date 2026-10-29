// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function load(vercelEnv: string) {
  vi.stubEnv('VERCEL_ENV', vercelEnv);
  vi.resetModules();
  return (await import('./robots')).default();
}

describe('robots', () => {
  it('preview disallows all', async () => {
    const r = await load('preview');
    expect(r.rules).toEqual([{ userAgent: '*', disallow: '/' }]);
  });

  it('production allows and points at the sitemap', async () => {
    const r = await load('production');
    expect(r.rules).toEqual([{ userAgent: '*', allow: '/' }]);
    expect(r.sitemap).toBe('https://rivalmonday.com/sitemap.xml');
    expect(r.host).toBe('https://rivalmonday.com');
  });
});
