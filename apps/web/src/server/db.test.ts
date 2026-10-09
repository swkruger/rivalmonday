import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@cs/db', async (orig) => ({
  ...(await orig<typeof import('@cs/db')>()),
  createDb: vi.fn((url: string) => ({ db: { url }, close: vi.fn(async () => {}) })),
}));

const BASE: Record<string, string> = {
  APP_URL: 'http://localhost:3000', BETTER_AUTH_SECRET: 'b'.repeat(32), LINK_SIGNING_SECRET: 'l'.repeat(32), EMAIL_FROM: 'from@example.com',
  DATABASE_URL: 'postgresql://o:p@h.example/cs_dev', APP_DATABASE_URL: 'postgresql://a:p@h.example/cs_dev', SERVICE_DATABASE_URL: 'postgresql://s:p@h.example/cs_dev',
  TEST_DATABASE_URL: 'postgresql://o:p@h.example/cs_test', TEST_APP_DATABASE_URL: 'postgresql://a:p@h.example/cs_test', TEST_SERVICE_DATABASE_URL: 'postgresql://s:p@h.example/cs_test',
};
const url = (db: unknown) => (db as { url: string }).url;
let dir: string;
let file: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'web-db-'));
  file = join(dir, 'dev-env.json');
  for (const [k, v] of Object.entries(BASE)) vi.stubEnv(k, v);
  vi.stubEnv('NODE_ENV', 'development');
  vi.stubEnv('RM_DEV_ENV_FILE', file);
});
afterEach(async () => {
  const { clearEnvCaches } = await import('./env-cache');
  await clearEnvCaches();
  vi.unstubAllEnvs();
  rmSync(dir, { recursive: true, force: true });
});

describe('dbs() per environment (spec §8 client cache)', () => {
  it('returns a different client set after a switch and the same one when switching back', async () => {
    vi.stubEnv('DEV_PANEL', '1');
    const { dbs } = await import('./db');
    const { writeDevEnv } = await import('./dev-guard');
    expect(url(dbs().app)).toBe(BASE.APP_DATABASE_URL);
    await writeDevEnv(file, 'demo');
    const demo = dbs();
    expect([url(demo.app), url(demo.service)]).toEqual(['postgresql://a:p@h.example/cs_demo', 'postgresql://s:p@h.example/cs_demo']);
    await writeDevEnv(file, 'test');
    expect(url(dbs().app)).toBe(BASE.TEST_APP_DATABASE_URL);
    await writeDevEnv(file, 'demo');
    expect(dbs().app).toBe(demo.app);
  });

  it('ignores .dev-env.json while the guard is off', async () => {
    vi.stubEnv('DEV_PANEL', '');
    const { dbs } = await import('./db');
    const { writeDevEnv } = await import('./dev-guard');
    await writeDevEnv(file, 'demo');
    expect(url(dbs().app)).toBe(BASE.APP_DATABASE_URL);
  });
});
