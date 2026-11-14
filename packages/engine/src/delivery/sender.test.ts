import { agency, agencySendingDomain, type SendingDomainStatus } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { clientFromAddress, mcpSignInSender, platformFromEnv, platformSender, senderFor } from './sender';
import { testSenderConfig } from './test-config';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const cfg = testSenderConfig({ platformFrom: 'hello@rivalmonday.app', hostEnv: { appUrl: 'https://rivalmonday.app', neutralDomain: 'clients.example', extraPlatformHosts: [] } });

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
  await dbs.owner.update(agency).set({ hostSlug: 'acme', branding: { displayName: 'Acme Marketing' } }).where(eq(agency.id, IDS.agencyA));
});
const domain = (status: SendingDomainStatus, localPart = 'news') =>
  dbs.owner.insert(agencySendingDomain).values({ agencyId: IDS.agencyA, domain: 'mail.acme.co', localPart, status });

describe('senderFor', () => {
  it('client audience uses the verified sending domain and local part', async () => {
    await domain('verified');
    expect(await senderFor(dbs.service, IDS.agencyA, 'client', cfg)).toEqual({ from: '"Acme Marketing" <news@mail.acme.co>' });
    expect(await clientFromAddress(dbs.service, IDS.agencyA, cfg.hostEnv)).toBe('news@mail.acme.co');
  });

  it('pending/failed/removed → <slug>@mail.<neutral>', async () => {
    for (const status of ['pending', 'failed', 'removed'] as const) {
      await dbs.owner.delete(agencySendingDomain);
      await domain(status);
      expect((await senderFor(dbs.service, IDS.agencyA, 'client', cfg)).from).toBe('"Acme Marketing" <acme@mail.clients.example>');
      expect(await clientFromAddress(dbs.service, IDS.agencyA, cfg.hostEnv)).toBe('acme@mail.clients.example');
    }
  });

  it('client audience never uses EMAIL_FROM or the APP_URL domain', async () => {
    for (const status of [null, 'pending', 'verified', 'failed', 'removed'] as const) {
      await dbs.owner.delete(agencySendingDomain);
      if (status) await domain(status);
      const { from } = await senderFor(dbs.service, IDS.agencyA, 'client', cfg);
      expect(from).not.toContain(cfg.platformFrom);
      expect(from).not.toContain('rivalmonday');
    }
  });

  it('uses fromName (quoted, unsafe characters dropped) over displayName', async () => {
    await dbs.owner.update(agency).set({ branding: { displayName: 'Acme', fromName: 'The "Acme"\r\nTeam' } }).where(eq(agency.id, IDS.agencyA));
    expect((await senderFor(dbs.service, IDS.agencyA, 'client', cfg)).from).toBe('"The AcmeTeam" <acme@mail.clients.example>');
  });

  it('replyTo is branding fromEmail when set', async () => {
    expect((await senderFor(dbs.service, IDS.agencyA, 'client', cfg)).replyTo).toBeUndefined();
    await dbs.owner.update(agency).set({ branding: { displayName: 'Acme Marketing', fromEmail: 'jo@acme.co' } }).where(eq(agency.id, IDS.agencyA));
    expect(await senderFor(dbs.service, IDS.agencyA, 'client', cfg)).toEqual({ from: '"Acme Marketing" <acme@mail.clients.example>', replyTo: 'jo@acme.co' });
  });

  it('agency audience is the platform sender', async () => {
    await domain('verified');
    expect(await senderFor(dbs.service, IDS.agencyA, 'agency', cfg)).toEqual({ from: '"Rival Monday" <hello@rivalmonday.app>' });
    expect(platformSender(cfg)).toBe('"Rival Monday" <hello@rivalmonday.app>');
  });

  it('throws for an unknown agency', async () => {
    await expect(senderFor(dbs.service, '00000000-0000-4000-8000-0000000000ff', 'client', cfg)).rejects.toThrow(/unknown agency/);
  });
});

describe('platformFromEnv / mcpSignInSender', () => {
  it('EMAIL_FROM, else briefs@<APP_URL host>, else empty', () => {
    expect(platformFromEnv({ EMAIL_FROM: ' hi@rm.test ', APP_URL: 'https://app.rm.test' })).toBe('hi@rm.test');
    expect(platformFromEnv({ APP_URL: 'https://app.rm.test/' })).toBe('briefs@app.rm.test');
    expect(platformFromEnv({})).toBe('');
  });

  it('MCP sign-in mail comes from the neutral domain', () => {
    expect(mcpSignInSender(cfg.hostEnv)).toBe('"Sign in" <sign-in@mail.clients.example>');
  });
});
