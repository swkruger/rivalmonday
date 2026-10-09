import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { assertDatabase, databaseNameOf, isEnvName, resolveEnvironment, withDatabase } from './environments';

const ROOT = resolve('/repo');
const ENV = {
  DATABASE_URL: 'postgresql://owner:s3cr%40t@ep-x.neon.tech/cs_dev?sslmode=require&channel_binding=require',
  APP_DATABASE_URL: 'postgresql://app_user:pw1@ep-x.neon.tech/cs_dev?sslmode=require',
  SERVICE_DATABASE_URL: 'postgresql://app_service:pw2@ep-x.neon.tech/cs_dev?sslmode=require',
  TEST_DATABASE_URL: 'postgresql://owner:pw3@ep-x.neon.tech/cs_test?sslmode=require',
  TEST_APP_DATABASE_URL: 'postgresql://app_user:pw4@ep-x.neon.tech/cs_test?sslmode=require',
  TEST_SERVICE_DATABASE_URL: 'postgresql://app_service:pw5@ep-x.neon.tech/cs_test?sslmode=require',
} as unknown as NodeJS.ProcessEnv;

describe('assertDatabase', () => {
  it('passes on an exact match', () => {
    expect(() => assertDatabase('postgresql://o:p@h/cs_demo?sslmode=require', 'cs_demo')).not.toThrow();
  });

  it.each([
    ['cs_dev', 'postgresql://o:p@h/cs_dev'],
    ['cs_test', 'postgresql://o:p@h/cs_test'],
    ['a different name', 'postgresql://o:p@h/cs_demo2'],
  ])('throws for %s', (_label, url) => {
    expect(() => assertDatabase(url, 'cs_demo')).toThrow(/expected exactly "cs_demo"/);
  });

  it('throws for a malformed URL without echoing it', () => {
    for (const bad of ['not a url', 'https://h/cs_demo', 'postgresql://o:secret@h/', 'postgresql://o:secret@h/a/b']) {
      expect(() => assertDatabase(bad, 'cs_demo')).toThrow(/Malformed database URL/);
      try {
        assertDatabase(bad, 'cs_demo');
      } catch (e) {
        expect((e as Error).message).not.toContain('secret');
      }
    }
  });
});

describe('databaseNameOf / withDatabase', () => {
  it('reads and swaps the database name, keeping credentials and query parameters', () => {
    expect(databaseNameOf(ENV.DATABASE_URL!)).toBe('cs_dev');
    expect(withDatabase(ENV.DATABASE_URL!, 'cs_demo')).toBe('postgresql://owner:s3cr%40t@ep-x.neon.tech/cs_demo?sslmode=require&channel_binding=require');
  });

  it('refuses a name that is not a plain identifier', () => {
    expect(() => withDatabase(ENV.DATABASE_URL!, 'cs_demo; drop')).toThrow(/Invalid database name/);
  });
});

describe('resolveEnvironment', () => {
  it('DEV uses the existing variables and the worker evidence directory', () => {
    const r = resolveEnvironment('dev', { repoRoot: ROOT, env: ENV });
    expect(r).toEqual({
      name: 'dev', ownerUrl: ENV.DATABASE_URL, appUrl: ENV.APP_DATABASE_URL, serviceUrl: ENV.SERVICE_DATABASE_URL,
      evidenceDir: join(ROOT, 'apps', 'worker', '.evidence'),
    });
  });

  it('DEV honours a relative EVIDENCE_FS_DIR against apps/worker (HANDOVER §6)', () => {
    expect(resolveEnvironment('dev', { repoRoot: ROOT, env: { ...ENV, EVIDENCE_FS_DIR: './.ev' } }).evidenceDir).toBe(join(ROOT, 'apps', 'worker', '.ev'));
  });

  it('DEMO swaps cs_dev for cs_demo in all three URLs, query parameters included', () => {
    const r = resolveEnvironment('demo', { repoRoot: ROOT, env: ENV });
    expect(r.ownerUrl).toBe('postgresql://owner:s3cr%40t@ep-x.neon.tech/cs_demo?sslmode=require&channel_binding=require');
    expect(r.appUrl).toBe('postgresql://app_user:pw1@ep-x.neon.tech/cs_demo?sslmode=require');
    expect(r.serviceUrl).toBe('postgresql://app_service:pw2@ep-x.neon.tech/cs_demo?sslmode=require');
    expect(r.evidenceDir).toBe(join(ROOT, 'apps', 'worker', '.evidence-demo'));
  });

  it('DEMO refuses to derive from a URL that is not cs_dev (Review Focus 1)', () => {
    expect(() => resolveEnvironment('demo', { repoRoot: ROOT, env: { ...ENV, DATABASE_URL: 'postgresql://o:p@h/cs_prod' } })).toThrow(/DATABASE_URL must name cs_dev/);
  });

  it('TEST uses the TEST_* variables and the E2E evidence store', () => {
    const r = resolveEnvironment('test', { repoRoot: ROOT, env: ENV });
    expect([r.ownerUrl, r.appUrl, r.serviceUrl]).toEqual([ENV.TEST_DATABASE_URL, ENV.TEST_APP_DATABASE_URL, ENV.TEST_SERVICE_DATABASE_URL]);
    expect(r.evidenceDir).toBe(join(ROOT, 'apps', 'web', 'test-results', 'evidence'));
  });

  it('names a missing variable', () => {
    expect(() => resolveEnvironment('test', { repoRoot: ROOT, env: {} as NodeJS.ProcessEnv })).toThrow('TEST_DATABASE_URL is required');
  });

  it('isEnvName accepts only the three names', () => {
    expect(['dev', 'demo', 'test', 'prod', 1, null].map(isEnvName)).toEqual([true, true, true, false, false, false]);
  });
});
