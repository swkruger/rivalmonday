import { verifyOAuthQueryParams } from '@better-auth/oauth-provider';
import { consentIdFor } from '@cs/tools';
import { agencyBilling, client, invitation, membership, oauthGrantBinding, plan } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, testUrls, truncateAll } from '@cs/db/test-helpers';
import { resolveBranding } from '@cs/email';
import { betterAuth } from 'better-auth';
import { eq, sql } from 'drizzle-orm';
import { Pool } from 'pg';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { seedAuthUsers, truncateAuth } from '../../test/auth-fixtures';
import { APP, oauthHarness, pathOf, queryOf } from '../../test/oauth-fixtures';
import { buildAuthOptions } from './auth-options';
import type { WebEnv } from './env';
import { safeNext } from './safe-next';
import { bindConsent, type ConsentTarget, consentOptions, createVerifyOAuth, oauthClientName, oauthQueryFrom, oauthResumePath, pickConsent, redirectHostOf } from './oauth-consent';

const dbs = openTestDbs();
const pool = new Pool({ connectionString: testUrls.service });
afterAll(async () => {
  await pool.end();
  await dbs.closeAll();
});

const env: WebEnv = {
  appUrl: APP, appDatabaseUrl: testUrls.app, serviceDatabaseUrl: testUrls.service, queueDatabaseUrl: testUrls.owner,
  authSecret: 's'.repeat(40), linkSecrets: ['l'.repeat(40)], emailFrom: 'from@example.com', google: null, defaultAgencyId: null, webMonitoring: false, kbImport: false, platformAdmins: [], askFakeAi: false, setupFakeLookup: false, webhookFakeSend: false, siteOrigins: [],
};
const links: string[] = [];
const background: Promise<unknown>[] = [];
const flush = () => Promise.all(background.splice(0));
const auth = betterAuth(buildAuthOptions({
  env, service: dbs.service, pool, branding: async () => resolveBranding('Rival Monday', null),
  runInBackground: (task) => void background.push(task), sendEmail: async () => {}, onMagicLink: (_e, url) => void links.push(url),
}));
const verifyOAuth = createVerifyOAuth({ context: () => auth.$context, service: dbs.service, appUrl: APP });

const member = (userId: string, role: 'agency_admin' | 'account_manager' | 'client_owner' | 'client_viewer', clientId: string | null = null, agencyId: string = IDS.agencyA) =>
  dbs.service.insert(membership).values({ userId, agencyId, role, clientId, createdBy: 't' }).returning().then((r) => r[0]!);
const enableMcp = (clientId: string) => dbs.service.update(client).set({ features: ['mcp'] }).where(eq(client.id, clientId));
const oauthClient = (id: string, name: string | null = 'Claude') => dbs.owner.execute(sql`insert into auth."oauthClient" (id, "clientId", "redirectUris", name) values (${id}, ${id}, '[]'::jsonb, ${name})`);
const pluginConsent = (id: string, userId: string, clientId: string) =>
  dbs.owner.execute(sql`insert into auth."oauthConsent" (id, "clientId", "userId", scopes, "createdAt", "updatedAt") values (${id}, ${clientId}, ${userId}, '["read"]'::jsonb, now(), now())`);
const pluginToken = (id: string, userId: string, clientId: string) =>
  dbs.owner.execute(sql`insert into auth."oauthAccessToken" (id, token, "clientId", "userId", "expiresAt", "createdAt", scopes) values (${id}, ${`h-${id}`}, ${clientId}, ${userId}, now() + interval '1 hour', now(), '["read"]'::jsonb)`);
const revokedTokens = async () => [...(await dbs.owner.execute<{ id: string }>(sql`select id from auth."oauthAccessToken" where revoked is not null order by id`))].map((r) => r.id);

beforeEach(async () => {
  links.length = 0;
  await flush();
  await truncateAll(dbs.owner);
  await truncateAuth(dbs.owner);
  await seedTenancy(dbs.owner);
  await seedAuthUsers(dbs.owner, { id: 'u1', email: 'u1@e.co' }, { id: 'u2', email: 'u2@e.co' });
});

describe('consentOptions', () => {
  it('agency membership → one "all clients" option with 3 scopes', async () => {
    const m = await member('u1', 'agency_admin');
    expect(await consentOptions(dbs.service, 'u1', 'read offline_access')).toEqual([
      { membershipId: m.id, agencyId: IDS.agencyA, clientId: null, scopes: ['read'], label: 'Agency A: all clients you can access' },
    ]);
    expect((await consentOptions(dbs.service, 'u1', 'manage offline_access'))[0]!.scopes).toEqual(['read', 'feedback', 'manage']);
    expect((await consentOptions(dbs.service, 'u1', null))[0]!.scopes).toEqual(['read', 'feedback', 'manage']);
  });

  it('client_viewer → read only', async () => {
    await enableMcp(IDS.clientA1);
    const m = await member('u1', 'client_viewer', IDS.clientA1);
    expect(await consentOptions(dbs.service, 'u1', 'manage')).toEqual([
      { membershipId: m.id, agencyId: IDS.agencyA, clientId: IDS.clientA1, scopes: ['read'], label: 'A1 HVAC (Agency A)' },
    ]);
  });

  it('client without mcp feature or prospect → no option', async () => {
    await member('u1', 'client_owner', IDS.clientA1);
    expect(await consentOptions(dbs.service, 'u1', 'read')).toEqual([]);
    await enableMcp(IDS.clientA1);
    expect((await consentOptions(dbs.service, 'u1', 'manage'))[0]!.scopes).toEqual(['read', 'feedback', 'manage']);
    await dbs.service.update(client).set({ status: 'prospect' }).where(eq(client.id, IDS.clientA1));
    expect(await consentOptions(dbs.service, 'u1', 'read')).toEqual([]);
  });

  it('skips memberships whose agency plan has no mcp (7a2 D13)', async () => {
    await member('u1', 'agency_admin');
    await enableMcp(IDS.clientB1);
    await member('u1', 'client_owner', IDS.clientB1, IDS.agencyB);
    const [p] = await dbs.owner.insert(plan).values({ code: 'nomcp', version: 1, name: 'No MCP', basePriceCents: 0, includedSeats: 3, seatPriceCents: 0, trialDays: 30, features: ['ask'], createdBy: 't' }).returning({ id: plan.id });
    await dbs.owner.insert(agencyBilling).values({ agencyId: IDS.agencyA, state: 'active', planId: p!.id });
    expect((await consentOptions(dbs.service, 'u1', 'read')).map((o) => o.agencyId)).toEqual([IDS.agencyB]);
  });

  it("requested 'read' caps options to read", async () => {
    await member('u1', 'agency_admin');
    await enableMcp(IDS.clientB1);
    await member('u1', 'client_owner', IDS.clientB1, IDS.agencyB);
    expect((await consentOptions(dbs.service, 'u1', 'read offline_access')).map((o) => o.scopes)).toEqual([['read'], ['read']]);
    expect((await consentOptions(dbs.service, 'u1', 'feedback')).map((o) => o.scopes)).toEqual([['read', 'feedback'], ['read', 'feedback']]);
  });
});

describe('pickConsent', () => {
  const options = [{ membershipId: 'm1', agencyId: IDS.agencyA, clientId: null, scopes: ['read', 'feedback'] as const, label: 'x' }].map((o) => ({ ...o, scopes: [...o.scopes] }));
  it('returns the target for a held membership and offered scope', () => {
    expect(pickConsent(options, 'm1', 'feedback')).toEqual({ agencyId: IDS.agencyA, clientId: null, scope: 'feedback' });
  });
  it('rejects a membership the user does not hold', () => {
    expect(pickConsent(options, 'someone-elses-membership', 'read')).toBeNull();
    expect(pickConsent(options, '', 'read')).toBeNull();
  });
  it('rejects a scope above the option', () => {
    expect(pickConsent(options, 'm1', 'manage')).toBeNull();
    expect(pickConsent(options, 'm1', 'offline_access')).toBeNull();
  });
});

describe('bindConsent', () => {
  const target = { agencyId: IDS.agencyA, clientId: null, scope: 'read' as const };
  beforeEach(async () => {
    await oauthClient('oc1');
    await pluginConsent('c1', 'u1', 'oc1');
    await pluginToken('t-u1', 'u1', 'oc1');
    await pluginToken('t-u2', 'u2', 'oc1');
  });

  it('inserts, revoking stray plugin tokens of that user and OAuth client (no previous binding: fix round 1)', async () => {
    await bindConsent(dbs.service, { consentId: 'c1', oauthClientId: 'oc1', userId: 'u1', target });
    expect(await dbs.service.select().from(oauthGrantBinding)).toMatchObject([{ consentId: 'c1', oauthClientId: 'oc1', userId: 'u1', agencyId: IDS.agencyA, clientId: null, scope: 'read', revokedAt: null }]);
    expect(await revokedTokens()).toEqual(['t-u1']);
  });

  it('re-consent with a different workspace revokes earlier tokens', async () => {
    await bindConsent(dbs.service, { consentId: 'c1', oauthClientId: 'oc1', userId: 'u1', target });
    await bindConsent(dbs.service, { consentId: 'c1', oauthClientId: 'oc1', userId: 'u1', target: { agencyId: IDS.agencyA, clientId: IDS.clientA1, scope: 'read' } });
    expect(await revokedTokens()).toEqual(['t-u1']);
    expect((await dbs.service.select().from(oauthGrantBinding))[0]).toMatchObject({ clientId: IDS.clientA1, revokedAt: null });
  });

  it('re-consent after a revoked binding revokes tokens and reactivates it', async () => {
    await bindConsent(dbs.service, { consentId: 'c1', oauthClientId: 'oc1', userId: 'u1', target });
    await dbs.service.update(oauthGrantBinding).set({ revokedAt: new Date() });
    await bindConsent(dbs.service, { consentId: 'c1', oauthClientId: 'oc1', userId: 'u1', target });
    expect(await revokedTokens()).toEqual(['t-u1']);
    expect((await dbs.service.select().from(oauthGrantBinding))[0]!.revokedAt).toBeNull();
  });

  it('same re-consent keeps tokens and the binding id', async () => {
    await bindConsent(dbs.service, { consentId: 'c1', oauthClientId: 'oc1', userId: 'u1', target });
    await pluginToken('t-u1-after', 'u1', 'oc1');
    const [before] = await dbs.service.select().from(oauthGrantBinding);
    await bindConsent(dbs.service, { consentId: 'c1', oauthClientId: 'oc1', userId: 'u1', target });
    const [after] = await dbs.service.select().from(oauthGrantBinding);
    expect(after!.id).toBe(before!.id);
    expect(await revokedTokens()).toEqual(['t-u1']); // only the stray token from before the first bind
  });
});

describe('oauthClientName, oauthQueryFrom, oauthResumePath', () => {
  it('names a registered client, null name when blank, null when unknown or disabled', async () => {
    await oauthClient('named', 'Claude Code');
    await oauthClient('blank', '  ');
    await oauthClient('off', 'Off');
    await dbs.owner.execute(sql`update auth."oauthClient" set disabled = true where id = 'off'`);
    expect(await oauthClientName(dbs.service, 'named')).toEqual({ name: 'Claude Code' });
    expect(await oauthClientName(dbs.service, 'blank')).toEqual({ name: null });
    expect(await oauthClientName(dbs.service, 'off')).toBeNull();
    expect(await oauthClientName(dbs.service, 'nope')).toBeNull();
  });

  it('rebuilds repeated keys and resumes sign-in only for a validly signed query', async () => {
    expect(oauthQueryFrom({ a: '1', ba_param: ['x', 'y'], none: undefined })).toBe('a=1&ba_param=x&ba_param=y');
    const yes = async () => true;
    const no = async () => false;
    const params = { client_id: 'c', sig: 's', scope: 'read offline_access' };
    expect(await oauthResumePath(params, 'secret', yes)).toBe('/api/auth/oauth2/authorize?client_id=c&sig=s&scope=read+offline_access');
    expect(await oauthResumePath(params, 'secret', no)).toBeNull();
    expect(await oauthResumePath({ client_id: 'c' }, 'secret', yes)).toBeNull();
    expect(await oauthResumePath({ next: '/x' }, 'secret', yes)).toBeNull();
  });
});

describe('redirectHostOf', () => {
  it('returns the redirect_uri host, with the port only when it is not the default', () => {
    expect(redirectHostOf('http://127.0.0.1:47123/callback')).toBe('127.0.0.1:47123');
    expect(redirectHostOf('https://claude.ai/api/mcp/auth_callback')).toBe('claude.ai');
    expect(redirectHostOf('https://app.example.com:443/cb')).toBe('app.example.com');
    expect(redirectHostOf('https://app.example.com:8443/cb')).toBe('app.example.com:8443');
  });

  it('is null when the redirect_uri is missing, unparseable or has no host', () => {
    expect(redirectHostOf(null)).toBeNull();
    expect(redirectHostOf('')).toBeNull();
    expect(redirectHostOf('not a url')).toBeNull();
    expect(redirectHostOf('cursor:callback')).toBeNull();
  });
});

describe('OAuth flow end to end (in-process)', () => {
  const h = () => oauthHarness(auth, () => links.at(-1), flush);

  /** Registers, signs in through the OAuth redirect, and stops at the consent page. */
  async function toConsent(harness: ReturnType<typeof h>, scope = 'read offline_access') {
    await dbs.service.insert(invitation).values({ agencyId: IDS.agencyA, email: 'oa@example.com', role: 'agency_admin', invitedBy: 't', expiresAt: new Date(Date.now() + 86_400_000) });
    const clientId = await harness.registerPublic();
    const { url, verifier } = harness.authorizeUrl(clientId, scope);
    const signedOut = await harness.call(url, { headers: { accept: 'text/html' } });
    // Shaped like Next's `searchParams`: a string per key, an array for repeated keys.
    const sp = new URLSearchParams(queryOf(signedOut.location!));
    const signInParams = Object.fromEntries([...new Set(sp.keys())].map((k) => [k, sp.getAll(k).length > 1 ? sp.getAll(k) : sp.get(k)!]));
    // As /sign-in does: the resume path must survive safeNext unchanged.
    const resume = await oauthResumePath(signInParams, env.authSecret, verifyOAuthQueryParams);
    const next = safeNext(resume);
    expect(next).toBe(resume);
    expect(next).toMatch(/^\/api\/auth\/oauth2\/authorize\?/);
    const resumed = await harness.signIn('oa@example.com', next!);
    const consentPage = await harness.call(resumed, { headers: { accept: 'text/html' } });
    expect(pathOf(consentPage.location!)).toBe('/oauth/consent');
    const userId = String([...(await dbs.owner.execute<{ id: string }>(sql`select id from auth."user" where email = 'oa@example.com'`))][0]!.id);
    return { clientId, verifier, oauthQuery: queryOf(consentPage.location!), userId };
  }

  async function connect(harness: ReturnType<typeof h>, target: ConsentTarget = { agencyId: IDS.agencyA, clientId: null, scope: 'read' }) {
    const c = await toConsent(harness);
    const accepted = await harness.consent(c.oauthQuery, true);
    expect(accepted.status).toBe(200);
    const consentId = String([...(await dbs.owner.execute<{ id: string }>(sql`select id from auth."oauthConsent"`))][0]!.id);
    await bindConsent(dbs.service, { consentId, oauthClientId: c.clientId, userId: c.userId, target });
    const code = new URL(accepted.body.url as string).searchParams.get('code')!;
    const tok = await harness.exchange(c.clientId, code, c.verifier);
    expect(tok.status).toBe(200);
    return { ...c, consentId, accessToken: tok.body.access_token as string, refreshToken: tok.body.refresh_token as string };
  }
  const refresh = (harness: ReturnType<typeof h>, clientId: string, refreshToken: string) =>
    harness.call('/api/auth/oauth2/token', { method: 'POST', form: { grant_type: 'refresh_token', refresh_token: refreshToken, client_id: clientId } });

  it('verifyOAuth: a bound token verifies to its user and consent', async () => {
    const c = await connect(h());
    expect(await verifyOAuth(c.accessToken)).toEqual({ userId: c.userId, consentId: c.consentId });
    expect(await verifyOAuth('not-a-token')).toBeNull();
  });

  it('verifyOAuth: revoked token → null', async () => {
    const c = await connect(h());
    await dbs.owner.execute(sql`update auth."oauthAccessToken" set revoked = now()`);
    expect(await verifyOAuth(c.accessToken)).toBeNull();
  });

  it('verifyOAuth: a token whose consent row is gone → null', async () => {
    const c = await connect(h());
    await dbs.owner.execute(sql`delete from auth."oauthConsent"`);
    expect(await verifyOAuth(c.accessToken)).toBeNull();
  });

  it('verifyOAuth: a token whose binding is revoked (or missing) → null', async () => {
    const c = await connect(h());
    await dbs.service.update(oauthGrantBinding).set({ revokedAt: new Date() });
    expect(await verifyOAuth(c.accessToken)).toBeNull();
    await dbs.service.delete(oauthGrantBinding);
    expect(await verifyOAuth(c.accessToken)).toBeNull();
  });

  it('verifyOAuth: a token for another audience → null', async () => {
    const c = await connect(h());
    const other = createVerifyOAuth({ context: () => auth.$context, service: dbs.service, appUrl: 'https://elsewhere.example' });
    expect(await other(c.accessToken)).toBeNull();
  });

  it('deny returns access_denied to the client and stores no consent', async () => {
    const harness = h();
    const c = await toConsent(harness);
    const denied = await harness.consent(c.oauthQuery, false);
    expect(new URL(denied.body.url as string).searchParams.get('error')).toBe('access_denied');
    expect([...(await dbs.owner.execute(sql`select id from auth."oauthConsent"`))]).toEqual([]);
  });

  it('a prior consent with an ACTIVE binding skips the consent page', async () => {
    const harness = h();
    const c = await connect(harness);
    const again = await harness.call(harness.authorizeUrl(c.clientId).url, { headers: { accept: 'text/html' } });
    expect(new URL(again.location!).searchParams.get('code')).toBeTruthy();
  });

  it('R9: authorize after the binding was revoked shows the consent page again, never a silent code', async () => {
    const harness = h();
    const c = await connect(harness);
    await dbs.service.update(oauthGrantBinding).set({ revokedAt: new Date() });
    const again = await harness.call(harness.authorizeUrl(c.clientId).url, { headers: { accept: 'text/html' } });
    expect(pathOf(again.location!)).toBe('/oauth/consent');
    expect(await verifyOAuth(c.accessToken)).toBeNull();
  });

  it('R9: authorize with a plugin consent that was never bound shows the consent page', async () => {
    const harness = h();
    const c = await toConsent(harness);
    expect((await harness.consent(c.oauthQuery, true)).status).toBe(200);
    // The action failed before bindConsent (no binding row); the stale plugin consent must not skip the page.
    const again = await harness.call(harness.authorizeUrl(c.clientId).url, { headers: { accept: 'text/html' } });
    expect(pathOf(again.location!)).toBe('/oauth/consent');
  });

  it('fix 1: re-consent after a binding was revoked (binding only) never revives the old access or refresh token', async () => {
    const harness = h();
    const c = await connect(harness);
    await dbs.service.update(oauthGrantBinding).set({ revokedAt: new Date() }); // as app_user's UPDATE (revoked_at) path does
    const { url, verifier } = harness.authorizeUrl(c.clientId);
    const again = await harness.call(url, { headers: { accept: 'text/html' } });
    expect(pathOf(again.location!)).toBe('/oauth/consent');
    const accepted = await harness.consent(queryOf(again.location!), true);
    const consentId = (await consentIdFor(dbs.service, c.userId, c.clientId))!;
    expect(consentId).not.toBe(c.consentId);
    await bindConsent(dbs.service, { consentId, oauthClientId: c.clientId, userId: c.userId, target: { agencyId: IDS.agencyA, clientId: IDS.clientA1, scope: 'read' } });
    const fresh = await harness.exchange(c.clientId, new URL(accepted.body.url as string).searchParams.get('code')!, verifier);
    expect(fresh.status).toBe(200);
    expect(await verifyOAuth(fresh.body.access_token as string)).toEqual({ userId: c.userId, consentId });
    expect(await verifyOAuth(c.accessToken)).toBeNull();
    expect((await refresh(harness, c.clientId, c.refreshToken)).status).toBe(400);
  });

  it('fix 2: after the bound membership is removed, authorize shows the consent page (no silent code) and old tokens die', async () => {
    const harness = h();
    const c = await connect(harness);
    await dbs.service.delete(membership).where(eq(membership.userId, c.userId));
    const again = await harness.call(harness.authorizeUrl(c.clientId).url, { headers: { accept: 'text/html' } });
    expect(pathOf(again.location!)).toBe('/oauth/consent');
    expect((await dbs.service.select().from(oauthGrantBinding))[0]!.revokedAt).not.toBeNull();
    expect((await refresh(harness, c.clientId, c.refreshToken)).status).toBe(400);
  });

  it('fix 2: after the bound client becomes a prospect, authorize shows the consent page', async () => {
    const harness = h();
    const c = await connect(harness, { agencyId: IDS.agencyA, clientId: IDS.clientA1, scope: 'read' });
    await member(c.userId, 'client_owner', IDS.clientA1);
    const skipped = await harness.call(harness.authorizeUrl(c.clientId).url, { headers: { accept: 'text/html' } });
    expect(new URL(skipped.location!).searchParams.get('code')).toBeTruthy(); // live client role and active client: skips
    await dbs.service.update(client).set({ status: 'prospect' }).where(eq(client.id, IDS.clientA1));
    const again = await harness.call(harness.authorizeUrl(c.clientId).url, { headers: { accept: 'text/html' } });
    expect(pathOf(again.location!)).toBe('/oauth/consent');
  });
});
