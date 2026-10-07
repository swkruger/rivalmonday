import { describe, expect, it } from 'vitest';
import { parseWebEnv } from './env';

const ok = {
  APP_URL: 'https://rm.nofingers.ai/', APP_DATABASE_URL: 'postgres://a', SERVICE_DATABASE_URL: 'postgres://s', DATABASE_URL: 'postgres://o',
  BETTER_AUTH_SECRET: 'b'.repeat(32), LINK_SIGNING_SECRET: 'l'.repeat(32), EMAIL_FROM: 'swkruger@nofingers.ai',
};

describe('parseWebEnv', () => {
  it('parses a complete environment', () => {
    const env = parseWebEnv(ok as unknown as NodeJS.ProcessEnv);
    expect(env).toMatchObject({ appUrl: 'https://rm.nofingers.ai', linkSecrets: ['l'.repeat(32)], google: null, defaultAgencyId: null, queueDatabaseUrl: 'postgres://o' });
  });

  it('adds the previous link secret and Google only when complete', () => {
    const env = parseWebEnv({ ...ok, LINK_SIGNING_SECRET_PREVIOUS: 'p'.repeat(32), GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 'sec' } as unknown as NodeJS.ProcessEnv);
    expect(env.linkSecrets).toHaveLength(2);
    expect(env.google).toEqual({ clientId: 'id', clientSecret: 'sec' });
    expect(parseWebEnv({ ...ok, GOOGLE_CLIENT_ID: 'id' } as unknown as NodeJS.ProcessEnv).google).toBeNull();
  });

  it('lists every problem at once', () => {
    expect(() => parseWebEnv({ ...ok, BETTER_AUTH_SECRET: 'short', APP_URL: undefined, DEFAULT_AGENCY_ID: 'nope' } as unknown as NodeJS.ProcessEnv)).toThrow(/BETTER_AUTH_SECRET[\s\S]*APP_URL[\s\S]*DEFAULT_AGENCY_ID/);
  });

  it('reads WEB_MONITORING_ENABLED as an explicit opt-in', () => {
    expect(parseWebEnv({ ...ok } as unknown as NodeJS.ProcessEnv).webMonitoring).toBe(false);
    expect(parseWebEnv({ ...ok, WEB_MONITORING_ENABLED: 'yes' } as unknown as NodeJS.ProcessEnv).webMonitoring).toBe(false);
    expect(parseWebEnv({ ...ok, WEB_MONITORING_ENABLED: 'true' } as unknown as NodeJS.ProcessEnv).webMonitoring).toBe(true);
  });

  it('reads PLATFORM_ADMIN_EMAILS as a normalised list', () => {
    expect(parseWebEnv({ ...ok } as unknown as NodeJS.ProcessEnv).platformAdmins).toEqual([]);
    expect(parseWebEnv({ ...ok, PLATFORM_ADMIN_EMAILS: 'A@b.co, c@d.co' } as unknown as NodeJS.ProcessEnv).platformAdmins).toEqual(['a@b.co', 'c@d.co']);
  });
});
