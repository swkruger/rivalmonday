import { describe, expect, it } from 'vitest';
import { REHEARSAL_ENV, REQUIRED_PROD_ENV, emailFromErrors, missingProdEnv, rehearsalEnvErrors } from './env';

describe('emailFromErrors', () => {
  it('accepts a bare address or unset', () => {
    expect(emailFromErrors({ EMAIL_FROM: 'support@mail.rivalmonday.app' })).toEqual([]);
    expect(emailFromErrors({ EMAIL_FROM: '  briefs@x.example ' })).toEqual([]);
    expect(emailFromErrors({})).toEqual([]);
  });
  it('refuses a display name: templates add "Name <EMAIL_FROM>" themselves and Postmark rejects the double wrap', () => {
    expect(emailFromErrors({ EMAIL_FROM: 'Rival Monday Staging <support@mail.rivalmonday.app>' })).toEqual(['EMAIL_FROM must be a bare address such as briefs@mail.example.com, without a display name']);
    expect(emailFromErrors({ EMAIL_FROM: '<support@x.example>' })).toHaveLength(1);
    expect(emailFromErrors({ EMAIL_FROM: 'not-an-address' })).toHaveLength(1);
  });
});

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
  it('has the Decision 4 list plus the 7c2 pooled app URL (Jev rides OPENROUTER_API_KEY, no TYPESAFE_API_KEY)', () => {
    expect(REQUIRED_PROD_ENV).toHaveLength(13);
    expect(REQUIRED_PROD_ENV).toContain('OPENROUTER_API_KEY');
    expect(REQUIRED_PROD_ENV).not.toContain('TYPESAFE_API_KEY');
  });
  it('production refuses to start without SERVICE_DATABASE_POOLED_URL (the app pool is sized for the pooler); dev falls back', () => {
    const env: NodeJS.ProcessEnv = { NODE_ENV: 'production' };
    for (const k of REQUIRED_PROD_ENV) env[k] = 'x';
    delete env.SERVICE_DATABASE_POOLED_URL;
    expect(missingProdEnv(env)).toEqual(['SERVICE_DATABASE_POOLED_URL']);
    expect(missingProdEnv({ ...env, NODE_ENV: 'development' })).toEqual([]);
  });
});

describe('rehearsalEnvErrors', () => {
  const VALUES: Record<string, string> = { AI_PROVIDER_MODE: 'rehearsal', REHEARSAL_LIVE_CLIENT_IDS: 'c1', VENDOR_FAKE_MODE: 'fixtures', CRAWL_HOST_ALLOWLIST: 'a.example', VENDOR_LIVE_RANK_SCANS: 'true' };
  /** Real keys `VENDOR_LIVE_RANK_SCANS` needs (values here are placeholders). */
  const RANK_KEYS = { DATAFORSEO_LOGIN: 'dfs-login', DATAFORSEO_PASSWORD: 'dfs-pw', STADIA_API_KEY: 'stadia-key' };
  it('production refuses each of the vars', () => {
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
    expect(rehearsalEnvErrors({ NODE_ENV: 'production', SENTRY_ENVIRONMENT: 'staging', ...VALUES, ...RANK_KEYS })).toEqual([]);
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
  it('a non-blank allowlist with no hosts is an error', () => {
    expect(rehearsalEnvErrors({ NODE_ENV: 'development', CRAWL_HOST_ALLOWLIST: ' , ' })).toEqual(['CRAWL_HOST_ALLOWLIST has no hosts']);
    expect(rehearsalEnvErrors({ NODE_ENV: 'development', CRAWL_HOST_ALLOWLIST: ',' })).toEqual(['CRAWL_HOST_ALLOWLIST has no hosts']);
  });
  it('development allows them', () => {
    expect(rehearsalEnvErrors({ NODE_ENV: 'development', ...VALUES, ...RANK_KEYS })).toEqual([]);
  });
  describe('VENDOR_LIVE_RANK_SCANS', () => {
    const staging = { NODE_ENV: 'production', SENTRY_ENVIRONMENT: 'staging', VENDOR_FAKE_MODE: 'fixtures', VENDOR_LIVE_RANK_SCANS: 'true', ...RANK_KEYS };
    it('staging with fixture mode and real keys allows it', () => {
      expect(rehearsalEnvErrors(staging)).toEqual([]);
    });
    it('production refuses it', () => {
      expect(rehearsalEnvErrors({ ...staging, SENTRY_ENVIRONMENT: undefined })).toEqual(['refusing rehearsal settings outside staging: VENDOR_FAKE_MODE, VENDOR_LIVE_RANK_SCANS']);
      expect(rehearsalEnvErrors({ ...staging, SENTRY_ENVIRONMENT: undefined, VENDOR_FAKE_MODE: undefined })).toContain('refusing rehearsal settings outside staging: VENDOR_LIVE_RANK_SCANS');
    });
    it('needs VENDOR_FAKE_MODE=fixtures (without it every vendor is live anyway)', () => {
      expect(rehearsalEnvErrors({ ...staging, VENDOR_FAKE_MODE: undefined })).toEqual(['VENDOR_LIVE_RANK_SCANS needs VENDOR_FAKE_MODE=fixtures']);
    });
    it('only accepts true', () => {
      expect(rehearsalEnvErrors({ ...staging, VENDOR_LIVE_RANK_SCANS: 'yes' })).toEqual(['VENDOR_LIVE_RANK_SCANS must be true']);
    });
    it('refuses a missing, blank or dummy key and names it', () => {
      expect(rehearsalEnvErrors({ ...staging, STADIA_API_KEY: undefined })).toEqual(['VENDOR_LIVE_RANK_SCANS needs real STADIA_API_KEY']);
      expect(rehearsalEnvErrors({ ...staging, DATAFORSEO_LOGIN: ' ', DATAFORSEO_PASSWORD: 'fixture' })).toEqual(['VENDOR_LIVE_RANK_SCANS needs real DATAFORSEO_LOGIN, DATAFORSEO_PASSWORD']);
    });
  });
});
