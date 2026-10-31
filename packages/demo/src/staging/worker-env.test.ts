import { describe, expect, it } from 'vitest';
import { stagingWorkerEnv } from './worker-env';

const DIRECT = 'ep-staging.c-7.us-east-2.aws.neon.tech';
const POOLED = 'ep-staging-pooler.c-7.us-east-2.aws.neon.tech';
const url = (role: string, host: string, db = 'cs_dev') => `postgresql://${role}:pw-${role}@${host}/${db}?sslmode=require`;

const FILE = {
  STAGING_DB_DIRECT_HOST: DIRECT,
  STAGING_DB_POOLED_HOST: POOLED,
  WORKER_DATABASE_URL: url('cs_worker', DIRECT),
  WEB_DATABASE_URL: url('cs_web', DIRECT),
  SERVICE_DATABASE_URL: url('app_service', DIRECT),
  SERVICE_DATABASE_POOLED_URL: url('app_service', POOLED),
  APP_URL: 'https://staging.rivalmonday.app',
  LINK_SIGNING_SECRET: 'link',
  EMAIL_FROM: 'Staging <staging@mail.rivalmonday.app>',
  POSTMARK_SERVER_TOKEN: 'postmark',
  R2_ACCOUNT_ID: 'acc',
  R2_ACCESS_KEY_ID: 'id',
  R2_SECRET_ACCESS_KEY: 'r2-secret',
  R2_BUCKET: 'rivalmonday-staging',
  OPENROUTER_API_KEY: 'or',
  REVIEWER_HASH_SALT: 'salt',
  SENTRY_DSN: 'https://sentry.example/1',
  SENTRY_ENVIRONMENT: 'staging',
  VENDOR_FAKE_MODE: 'fixtures',
  STRIPE_SECRET_KEY: 'web-only',
};

describe('stagingWorkerEnv', () => {
  it('maps WORKER_DATABASE_URL to DATABASE_URL and runs as production on its own port', () => {
    const env = stagingWorkerEnv(FILE, {});
    expect(env.DATABASE_URL).toBe(FILE.WORKER_DATABASE_URL);
    expect(env.NODE_ENV).toBe('production');
    expect(env.PORT).toBe('8081');
  });

  it('passes no web-only values', () => {
    const env = stagingWorkerEnv(FILE, {});
    expect(env.STRIPE_SECRET_KEY).toBeUndefined();
    expect(env.WEB_DATABASE_URL).toBeUndefined();
    expect(env.WORKER_DATABASE_URL).toBeUndefined();
  });

  it('keeps the shell basics but drops dev and crawling settings from the shell', () => {
    const env = stagingWorkerEnv(FILE, { PATH: '/bin', WEB_MONITORING_ENABLED: 'true', DATAFORSEO_LOGIN: 'real', DEV_PANEL: '1' });
    expect(env.PATH).toBe('/bin');
    expect(env.WEB_MONITORING_ENABLED).toBeUndefined();
    expect(env.DATAFORSEO_LOGIN).toBeUndefined();
    expect(env.DEV_PANEL).toBeUndefined();
  });

  it('lets a staging value replace the same name in the shell', () => {
    expect(stagingWorkerEnv(FILE, { DATABASE_URL: url('rivalmonday_test_owner', 'ep-dev.neon.tech') }).DATABASE_URL).toBe(FILE.WORKER_DATABASE_URL);
  });

  it('names missing variables, never values', () => {
    expect(() => stagingWorkerEnv({ ...FILE, SENTRY_DSN: '', R2_ACCOUNT_ID: ' ' }, {})).toThrow(/R2_ACCOUNT_ID.*SENTRY_DSN|SENTRY_DSN.*R2_ACCOUNT_ID/);
  });

  it('refuses a worker URL on any other host, without printing it', () => {
    let message = '';
    try {
      stagingWorkerEnv({ ...FILE, WORKER_DATABASE_URL: url('cs_worker', 'ep-dev.neon.tech') }, {});
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toMatch(/WORKER_DATABASE_URL/);
    expect(message).not.toMatch(/pw-cs_worker/);
  });

  it('refuses a pooled URL on the direct host, and a direct URL on the pooled host', () => {
    expect(() => stagingWorkerEnv({ ...FILE, SERVICE_DATABASE_POOLED_URL: url('app_service', DIRECT) }, {})).toThrow(/SERVICE_DATABASE_POOLED_URL/);
    expect(() => stagingWorkerEnv({ ...FILE, SERVICE_DATABASE_URL: url('app_service', POOLED) }, {})).toThrow(/SERVICE_DATABASE_URL/);
  });

  it('refuses the wrong database, role or malformed URL', () => {
    expect(() => stagingWorkerEnv({ ...FILE, WORKER_DATABASE_URL: url('cs_worker', DIRECT, 'other') }, {})).toThrow(/WORKER_DATABASE_URL/);
    expect(() => stagingWorkerEnv({ ...FILE, WORKER_DATABASE_URL: url('rivalmonday_test_owner', DIRECT) }, {})).toThrow(/WORKER_DATABASE_URL/);
    expect(() => stagingWorkerEnv({ ...FILE, WORKER_DATABASE_URL: 'not a url' }, {})).toThrow(/WORKER_DATABASE_URL/);
  });

  it('refuses a bucket not ending in -staging', () => {
    expect(() => stagingWorkerEnv({ ...FILE, R2_BUCKET: 'rivalmonday' }, {})).toThrow(/-staging/);
  });

  it('refuses unless this is staging with fixture vendors', () => {
    expect(() => stagingWorkerEnv({ ...FILE, SENTRY_ENVIRONMENT: 'production' }, {})).toThrow(/SENTRY_ENVIRONMENT/);
    expect(() => stagingWorkerEnv({ ...FILE, VENDOR_FAKE_MODE: '' }, {})).toThrow(/VENDOR_FAKE_MODE/);
  });
});
