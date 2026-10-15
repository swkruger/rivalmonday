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

  it('reads KB_IMPORT_ENABLED as an explicit opt-in', () => {
    expect(parseWebEnv({ ...ok } as unknown as NodeJS.ProcessEnv).kbImport).toBe(false);
    expect(parseWebEnv({ ...ok, KB_IMPORT_ENABLED: '1' } as unknown as NodeJS.ProcessEnv).kbImport).toBe(false);
    expect(parseWebEnv({ ...ok, KB_IMPORT_ENABLED: 'true' } as unknown as NodeJS.ProcessEnv).kbImport).toBe(true);
  });

  it('reads PLATFORM_ADMIN_EMAILS as a normalised list', () => {
    expect(parseWebEnv({ ...ok } as unknown as NodeJS.ProcessEnv).platformAdmins).toEqual([]);
    expect(parseWebEnv({ ...ok, PLATFORM_ADMIN_EMAILS: 'A@b.co, c@d.co' } as unknown as NodeJS.ProcessEnv).platformAdmins).toEqual(['a@b.co', 'c@d.co']);
  });

  it('passes the trimmed Connect webhook secret through', () => {
    expect(parseWebEnv({ ...ok } as unknown as NodeJS.ProcessEnv).stripe?.STRIPE_CONNECT_WEBHOOK_SECRET).toBeUndefined();
    expect(parseWebEnv({ ...ok, STRIPE_CONNECT_WEBHOOK_SECRET: ' whsec_c ' } as unknown as NodeJS.ProcessEnv).stripe?.STRIPE_CONNECT_WEBHOOK_SECRET).toBe('whsec_c');
  });

  it('passes BILLING_FAKE_GATEWAY through for gatewayFor and refuses it in production (R27)', () => {
    expect(parseWebEnv({ ...ok } as unknown as NodeJS.ProcessEnv).stripe?.BILLING_FAKE_GATEWAY).toBeUndefined();
    expect(parseWebEnv({ ...ok, BILLING_FAKE_GATEWAY: '1' } as unknown as NodeJS.ProcessEnv).stripe?.BILLING_FAKE_GATEWAY).toBe('1');
    expect(() => parseWebEnv({ ...ok, BILLING_FAKE_GATEWAY: '1', VERCEL_ENV: 'production' } as unknown as NodeJS.ProcessEnv)).toThrow(/BILLING_FAKE_GATEWAY/);
  });

  it('reads ASK_FAKE_AI and refuses it in production', () => {
    expect(parseWebEnv({ ...ok } as unknown as NodeJS.ProcessEnv).askFakeAi).toBe(false);
    expect(parseWebEnv({ ...ok, ASK_FAKE_AI: '1' } as unknown as NodeJS.ProcessEnv).askFakeAi).toBe(true);
    expect(parseWebEnv({ ...ok, ASK_FAKE_AI: '1', VERCEL_ENV: 'preview' } as unknown as NodeJS.ProcessEnv).askFakeAi).toBe(true);
    expect(() => parseWebEnv({ ...ok, ASK_FAKE_AI: '1', VERCEL_ENV: 'production' } as unknown as NodeJS.ProcessEnv)).toThrow(/ASK_FAKE_AI/);
    expect(parseWebEnv({ ...ok, VERCEL_ENV: 'production' } as unknown as NodeJS.ProcessEnv).askFakeAi).toBe(false);
  });
});
