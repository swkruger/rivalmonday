import { describe, expect, it } from 'vitest';
import { REHEARSAL_ENV, REQUIRED_PROD_ENV, missingProdEnv, rehearsalEnvErrors } from './env';

describe('missingProdEnv', () => {
  it('is empty outside production', () => {
    expect(missingProdEnv({ NODE_ENV: 'development' })).toEqual([]);
    expect(missingProdEnv({})).toEqual([]);
  });
  it('lists missing and blank vars in production', () => {
    const env: NodeJS.ProcessEnv = { NODE_ENV: 'production' };
    for (const k of REQUIRED_PROD_ENV) env[k] = 'x';
    expect(missingProdEnv(env)).toEqual([]);
    delete env.SENTRY_DSN;
    env.APP_URL = '   ';
    expect(missingProdEnv(env)).toEqual(['APP_URL', 'SENTRY_DSN']);
  });
  it('has the Decision 4 list', () => {
    expect(REQUIRED_PROD_ENV).toHaveLength(13);
  });
});

describe('rehearsalEnvErrors', () => {
  const VALUES: Record<string, string> = { AI_PROVIDER_MODE: 'rehearsal', REHEARSAL_LIVE_CLIENT_IDS: 'c1', VENDOR_FAKE_MODE: 'fixtures', CRAWL_HOST_ALLOWLIST: 'a.example' };
  it('production refuses each of the four vars', () => {
    for (const k of REHEARSAL_ENV) {
      const errs = rehearsalEnvErrors({ NODE_ENV: 'production', [k]: VALUES[k] });
      expect(errs.join(' ')).toContain(`refusing rehearsal settings outside staging: ${k}`);
    }
  });
  it('SENTRY_ENVIRONMENT "Staging" or "staging " refuses', () => {
    for (const se of ['Staging', 'staging ']) {
      expect(rehearsalEnvErrors({ NODE_ENV: 'production', SENTRY_ENVIRONMENT: se, VENDOR_FAKE_MODE: 'fixtures' })).toHaveLength(1);
    }
  });
  it('NODE_ENV unset refuses', () => {
    expect(rehearsalEnvErrors({ VENDOR_FAKE_MODE: 'fixtures' })).toHaveLength(1);
  });
  it('a blank value counts as unset', () => {
    expect(rehearsalEnvErrors({ NODE_ENV: 'production', CRAWL_HOST_ALLOWLIST: '  ', VENDOR_FAKE_MODE: '' })).toEqual([]);
  });
  it('staging allows them', () => {
    expect(rehearsalEnvErrors({ NODE_ENV: 'production', SENTRY_ENVIRONMENT: 'staging', ...VALUES })).toEqual([]);
  });
  it('staging crawling without an allowlist refuses', () => {
    const env = { NODE_ENV: 'production', SENTRY_ENVIRONMENT: 'staging', WEB_MONITORING_ENABLED: 'true' };
    expect(rehearsalEnvErrors(env)).toEqual(['staging crawling requires CRAWL_HOST_ALLOWLIST']);
    expect(rehearsalEnvErrors({ ...env, CRAWL_HOST_ALLOWLIST: 'a.example' })).toEqual([]);
  });
  it('rejects unknown mode values and live ids without rehearsal mode', () => {
    expect(rehearsalEnvErrors({ NODE_ENV: 'development', AI_PROVIDER_MODE: 'x' })).toEqual(['AI_PROVIDER_MODE must be live or rehearsal']);
    expect(rehearsalEnvErrors({ NODE_ENV: 'development', VENDOR_FAKE_MODE: 'x' })).toEqual(['VENDOR_FAKE_MODE must be fixtures']);
    expect(rehearsalEnvErrors({ NODE_ENV: 'production', SENTRY_ENVIRONMENT: 'staging', REHEARSAL_LIVE_CLIENT_IDS: 'c1' })).toEqual(['REHEARSAL_LIVE_CLIENT_IDS needs AI_PROVIDER_MODE=rehearsal']);
  });
  it('development allows them', () => {
    expect(rehearsalEnvErrors({ NODE_ENV: 'development', ...VALUES })).toEqual([]);
  });
});
