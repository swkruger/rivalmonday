import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ value: undefined as string | undefined }));
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: (n: string) => (n === 'rm_tz' && m.value !== undefined ? { name: n, value: m.value } : undefined) }),
}));

import { viewerTimeZone } from './viewer-tz';

describe('viewerTimeZone', () => {
  beforeEach(() => {
    m.value = undefined;
  });
  it('returns UTC without a cookie', async () => {
    expect(await viewerTimeZone()).toBe('UTC');
  });
  it('rejects an invalid zone', async () => {
    m.value = 'Not/AZone';
    expect(await viewerTimeZone()).toBe('UTC');
  });
  it('returns America/Chicago from the cookie', async () => {
    m.value = 'America%2FChicago';
    expect(await viewerTimeZone()).toBe('America/Chicago');
  });
});
