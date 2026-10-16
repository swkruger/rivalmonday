import { createHash } from 'node:crypto';
import { agency, agencyBilling, contact, invitation, membership, pendingSignup, plan } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, testUrls, truncateAll } from '@cs/db/test-helpers';
import { createMemoryTransport, renderEmail, resolveBranding } from '@cs/email';
import { betterAuth } from 'better-auth';
import { eq, sql } from 'drizzle-orm';
import { Pool } from 'pg';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { truncateAuth } from '../../test/auth-fixtures';
import { oauthHarness, pathOf, queryOf, REDIRECT } from '../../test/oauth-fixtures';
import { buildAuthOptions, oauthOptions } from './auth-options';
import type { WebEnv } from './env';

const dbs = openTestDbs();
const pool = new Pool({ connectionString: testUrls.service });
afterAll(async () => {
  await pool.end();
  await dbs.closeAll();
});

const env: WebEnv = {
  appUrl: 'http://localhost:3000', appDatabaseUrl: testUrls.app, serviceDatabaseUrl: testUrls.service, queueDatabaseUrl: testUrls.owner,
  authSecret: 's'.repeat(40), linkSecrets: ['l'.repeat(40)], emailFrom: 'from@example.com', google: null, defaultAgencyId: null, webMonitoring: false, kbImport: false, platformAdmins: [], askFakeAi: false,
};
const mail = createMemoryTransport();
let failSend = false;
// Background work (the sign-in-link check and send) is collected so tests can wait for it deterministically.
const background: Promise<unknown>[] = [];
const flush = () => Promise.all(background.splice(0));
const auth = betterAuth(buildAuthOptions({
  env, service: dbs.service, pool,
  branding: async () => resolveBranding('Rival Monday', null),
  runInBackground: (task) => void background.push(task),
  sendEmail: async (to, payload) => {
    if (failSend) throw new Error('transport down');
    const r = await renderEmail(payload);
    await mail.send({ from: env.emailFrom, to, replyTo: null, subject: r.subject, html: r.html, text: r.text, tag: 'sign_in', metadata: {} }, { agencyId: null, clientId: null });
  },
}));

const post = (path: string, body: unknown) =>
  auth.handler(new Request(`http://localhost:3000/api/auth${path}`, { method: 'POST', headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' }, body: JSON.stringify(body) }));
const linkFromMail = () => /https?:\/\/[^\s"]+magic-link\/verify[^\s"]+/.exec(mail.sent.at(-1)!.text)![0];
// Mirrors Better Auth's `defaultKeyHasher` (magic-link/utils.mjs): SHA-256 digest, base64url, no padding.
const hashedToken = (token: string) => createHash('sha256').update(token).digest('base64url');

beforeEach(async () => {
  mail.sent.length = 0;
  failSend = false;
  await flush();
  await truncateAll(dbs.owner);
  await truncateAuth(dbs.owner);
  await seedTenancy(dbs.owner);
});

describe('magic link sign-in', () => {
  it('sends nothing for an uninvited email but answers the same way', async () => {
    const res = await post('/sign-in/magic-link', { email: 'stranger@example.com', callbackURL: '/' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: true });
    await flush();
    expect(mail.sent).toHaveLength(0);
  });

  it('signs in an invited user, creating the user and accepting the invitation', async () => {
    await dbs.service.insert(invitation).values({ agencyId: IDS.agencyA, email: 'new@example.com', role: 'agency_admin', invitedBy: 't', expiresAt: new Date(Date.now() + 86_400_000) });
    const res = await post('/sign-in/magic-link', { email: 'New@Example.com', callbackURL: '/' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: true });
    // The check and send happen after the response, so nothing has been sent when it returns.
    expect(mail.sent).toHaveLength(0);
    await flush();
    expect(mail.sent).toHaveLength(1);
    expect(mail.sent[0]!.subject).toBe('Your sign-in link for Rival Monday');
    const verify = await auth.handler(new Request(linkFromMail()));
    expect([200, 302]).toContain(verify.status);
    expect(verify.headers.get('set-cookie')).toMatch(/session_token/);
    const members = await dbs.service.select().from(membership);
    expect(members).toHaveLength(1);
    expect(members[0]!.role).toBe('agency_admin');
    // Magic-link users have name '' in auth."user"; the contact stores NULL, not ''.
    const contacts = await dbs.service.select({ name: contact.name, userId: contact.userId }).from(contact);
    expect(contacts).toEqual([{ name: null, userId: members[0]!.userId }]);
  });

  it('refuses to create a user for an email whose invitation was revoked after the link was sent', async () => {
    await dbs.service.insert(invitation).values({ agencyId: IDS.agencyA, email: 'gone@example.com', role: 'agency_admin', invitedBy: 't', expiresAt: new Date(Date.now() + 86_400_000) });
    await post('/sign-in/magic-link', { email: 'gone@example.com', callbackURL: '/' });
    await flush();
    await dbs.service.update(invitation).set({ revokedAt: new Date() });
    const verify = await auth.handler(new Request(linkFromMail()));
    expect(verify.headers.get('set-cookie') ?? '').not.toMatch(/session_token=[^;]+;/);
    expect((await dbs.owner.execute(sql`select count(*)::int as n from auth."user"`))[0]).toMatchObject({ n: 0 });
  });

  it('answers an invited email normally when the send fails, logging the error without the link', async () => {
    await dbs.service.insert(invitation).values({ agencyId: IDS.agencyA, email: 'fail@example.com', role: 'agency_admin', invitedBy: 't', expiresAt: new Date(Date.now() + 86_400_000) });
    failSend = true;
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const res = await post('/sign-in/magic-link', { email: 'fail@example.com', callbackURL: '/' });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ status: true });
      await flush();
      expect(logged).toHaveBeenCalledTimes(1);
      const message = String(logged.mock.calls[0]![0]);
      expect(message).toContain('transport down');
      expect(message).not.toMatch(/token|magic-link|http/);
    } finally {
      logged.mockRestore();
    }
  });
});

describe('5b-2 hardening (decision 14)', () => {
  it('stores only a hash of the magic-link token, and the link still signs in', async () => {
    await dbs.service.insert(invitation).values({ agencyId: IDS.agencyA, email: 'hash@example.com', role: 'agency_admin', invitedBy: 't', expiresAt: new Date(Date.now() + 86_400_000) });
    await post('/sign-in/magic-link', { email: 'hash@example.com', callbackURL: '/' });
    await flush();
    const token = new URL(linkFromMail()).searchParams.get('token')!;
    const rows = [...(await dbs.owner.execute<{ identifier: string; value: string }>(sql`select identifier, value from auth.verification`))];
    expect(rows.length).toBeGreaterThan(0);
    // Discriminates plain vs. hashed storage: the stored identifier is `magic-link:<hash>`, never `magic-link:<rawToken>`.
    expect(rows.some((r) => r.identifier === `magic-link:${hashedToken(token)}`)).toBe(true);
    expect(rows.some((r) => r.identifier === `magic-link:${token}`)).toBe(false);
    const verify = await auth.handler(new Request(linkFromMail()));
    expect(verify.headers.get('set-cookie')).toMatch(/session_token/);
  });

  it('refuses a session for a user who has lost every sign-in right (e.g. a Google user whose memberships were removed)', async () => {
    const opts = buildAuthOptions({ env, service: dbs.service, pool, branding: async () => resolveBranding('Rival Monday', null), runInBackground: () => {}, sendEmail: async () => {} });
    const before = opts.databaseHooks!.session!.create!.before!;
    await dbs.owner.execute(sql`insert into auth."user" (id, name, email, "emailVerified") values ('g1', 'G', 'google@example.com', true)`);
    const session = { userId: 'g1', token: 't', expiresAt: new Date(Date.now() + 3_600_000), createdAt: new Date(), updatedAt: new Date() };
    expect(await before(session as never, undefined as never)).toBe(false);
    await dbs.service.insert(membership).values({ userId: 'g1', agencyId: IDS.agencyA, role: 'agency_admin', createdBy: 't' });
    expect(await before(session as never, undefined as never)).not.toBe(false);
  });
});

describe('Phase 10: pending agency sign-up completion (session.create.after)', () => {
  const PLAN = { code: 'standard', version: 1, name: 'Standard', basePriceCents: 22900, includedSeats: 3, seatPriceCents: 9900, trialDays: 30, isCurrent: true, createdBy: 'test' };
  const pend = (email: string) =>
    dbs.service.insert(pendingSignup).values({ email, agencyName: 'Fresh Agency', source: 'open', ipHash: 'h'.repeat(64), expiresAt: new Date(Date.now() + 86_400_000) });
  const fresh = async () => (await dbs.owner.select().from(agency)).filter((a) => a.id !== IDS.agencyA && a.id !== IDS.agencyB);
  const hookOpts = () => buildAuthOptions({ env, service: dbs.service, pool, branding: async () => resolveBranding('Rival Monday', null), runInBackground: () => {}, sendEmail: async () => {} });
  const sessionFor = (userId: string) => ({ userId, token: 't', expiresAt: new Date(Date.now() + 3_600_000), createdAt: new Date(), updatedAt: new Date() });

  it('a magic-link sign-in of a pending email creates the agency (trialing, admin membership) exactly once', async () => {
    await dbs.owner.insert(plan).values(PLAN);
    await pend('founder@fresh.co');
    await post('/sign-in/magic-link', { email: 'Founder@Fresh.co', callbackURL: '/onboarding/start' });
    await flush();
    expect(mail.sent).toHaveLength(1);
    const link = linkFromMail();
    const verify = await auth.handler(new Request(link));
    expect(verify.headers.get('set-cookie')).toMatch(/session_token/);
    const [a] = await fresh();
    expect(a).toMatchObject({ name: 'Fresh Agency' });
    const members = await dbs.service.select().from(membership).where(eq(membership.agencyId, a!.id));
    expect(members).toMatchObject([{ role: 'agency_admin' }]);
    expect((await dbs.owner.select().from(agencyBilling).where(eq(agencyBilling.agencyId, a!.id)))[0]!.state).toBe('trialing');
    // A second sign-in (new session) completes nothing more.
    const after = hookOpts().databaseHooks!.session!.create!.after!;
    await after(sessionFor(members[0]!.userId) as never, undefined as never);
    expect(await fresh()).toHaveLength(1);
  });

  it('an unverified user gets nothing', async () => {
    await dbs.owner.insert(plan).values(PLAN);
    await pend('unverified@fresh.co');
    await dbs.owner.execute(sql`insert into auth."user" (id, name, email, "emailVerified") values ('nv1', '', 'unverified@fresh.co', false)`);
    await hookOpts().databaseHooks!.session!.create!.after!(sessionFor('nv1') as never, undefined as never);
    expect(await fresh()).toEqual([]);
    expect((await dbs.owner.select().from(pendingSignup))[0]!.completedAt).toBeNull();
  });

  it('a completion failure is logged without the email and never blocks invitations or sign-in', async () => {
    // No current plan => startAgencyTrial throws inside the completion transaction.
    await pend('both@fresh.co');
    await dbs.service.insert(invitation).values({ agencyId: IDS.agencyA, email: 'both@fresh.co', role: 'account_manager', invitedBy: 't', expiresAt: new Date(Date.now() + 86_400_000) });
    await dbs.owner.execute(sql`insert into auth."user" (id, name, email, "emailVerified") values ('b1', '', 'both@fresh.co', true)`);
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await expect(hookOpts().databaseHooks!.session!.create!.after!(sessionFor('b1') as never, undefined as never)).resolves.toBeUndefined();
      expect(logged).toHaveBeenCalledTimes(1);
      expect(String(logged.mock.calls[0]![0])).toMatch(/^\[auth\] sign-up completion failed/);
      expect(String(logged.mock.calls[0]![0])).not.toContain('both@fresh.co');
    } finally {
      logged.mockRestore();
    }
    expect(await fresh()).toEqual([]);
    expect(await dbs.service.select().from(membership).where(eq(membership.userId, 'b1'))).toMatchObject([{ agencyId: IDS.agencyA, role: 'account_manager' }]);
  });
});

describe('onMagicLink (dev panel sign-in, deviation 4)', () => {
  it('hands the verify URL to the hook synchronously, before the background send', async () => {
    const seen: [string, string][] = [];
    const devAuth = betterAuth(buildAuthOptions({
      env, service: dbs.service, pool, branding: async () => resolveBranding('Rival Monday', null),
      runInBackground: (task) => void background.push(task), sendEmail: async () => {},
      onMagicLink: (email, url) => seen.push([email, url]),
    }));
    await (devAuth.api as unknown as { signInMagicLink: (a: unknown) => Promise<unknown> }).signInMagicLink({ body: { email: 'someone@example.com', callbackURL: '/agency' }, headers: new Headers() });
    expect(seen).toHaveLength(1);
    expect(seen[0]![0]).toBe('someone@example.com');
    expect(seen[0]![1]).toMatch(/\/api\/auth\/magic-link\/verify\?token=[^&]+&callbackURL=%2Fagency/);
    await flush();
  });
});

describe('OAuth provider (Phase 6a Task 11)', () => {
  const links: string[] = [];
  const oauthAuth = betterAuth(buildAuthOptions({
    env, service: dbs.service, pool, branding: async () => resolveBranding('Rival Monday', null),
    runInBackground: (task) => void background.push(task), sendEmail: async () => {}, onMagicLink: (_e, url) => void links.push(url),
  }));
  const h = () => oauthHarness(oauthAuth, () => links.at(-1), flush);
  const registered = async () => [...(await dbs.owner.execute<{ applicationType: string | null; tokenEndpointAuthMethod: string | null }>(sql`select "applicationType", "tokenEndpointAuthMethod" from auth."oauthClient"`))];
  const reg = (redirect_uris: string[], token_endpoint_auth_method?: string) =>
    h().register({ client_name: 'X', redirect_uris, grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], ...(token_endpoint_auth_method ? { token_endpoint_auth_method } : {}) });

  it('oauthOptions: scopes, hashed opaque tokens, 1 h access / 30 day refresh, the /mcp resource and only code + refresh grants', () => {
    expect(oauthOptions('https://app.example')).toMatchObject({
      loginPage: '/sign-in', consentPage: '/oauth/consent', scopes: ['offline_access', 'read', 'feedback', 'manage'],
      disableJwtPlugin: true, storeTokens: 'hashed', allowDynamicClientRegistration: true, allowUnauthenticatedClientRegistration: true,
      clientRegistrationDefaultScopes: ['read', 'offline_access'], clientRegistrationAllowedScopes: ['feedback', 'manage'],
      resources: ['https://app.example/mcp'], clientRegistrationDefaultResources: ['https://app.example/mcp'],
      grantTypes: ['authorization_code', 'refresh_token'], accessTokenExpiresIn: 3600, refreshTokenExpiresIn: 2_592_000,
    });
  });

  it('registers a public loopback client (Claude Code style, no application_type) as native', async () => {
    for (const uri of ['http://127.0.0.1:33418/callback', 'http://localhost:9000/cb', 'http://[::1]:7000/cb']) {
      const r = await reg([uri], 'none');
      expect(r.status, uri).toBe(201);
      expect(r.body.application_type, uri).toBe('native');
    }
    expect((await registered()).every((c) => c.applicationType === 'native' && c.tokenEndpointAuthMethod === 'none')).toBe(true);
  });

  it('does not rewrite a confidential loopback client (it stays web and is refused)', async () => {
    for (const method of ['client_secret_basic', 'client_secret_post', undefined]) {
      const r = await reg([REDIRECT], method);
      expect(r.status, String(method)).toBe(400);
      expect(r.body.error, String(method)).toBe('invalid_redirect_uri');
    }
    expect(await registered()).toEqual([]);
  });

  it('keeps refusing non-loopback http and mixed loopback + non-loopback redirects from a public client', async () => {
    for (const uris of [['http://evil.example/cb'], [REDIRECT, 'http://evil.example/cb'], ['http://127.0.0.2/cb']]) {
      const r = await reg(uris, 'none');
      expect(r.status, uris.join()).toBe(400);
      expect(r.body.error, uris.join()).toBe('invalid_redirect_uri');
    }
    expect(await registered()).toEqual([]);
  });

  it('leaves an explicit application_type alone', async () => {
    const r = await h().register({ client_name: 'X', redirect_uris: [REDIRECT], token_endpoint_auth_method: 'none', application_type: 'web', grant_types: ['authorization_code'], response_types: ['code'] });
    expect(r.status).toBe(400);
  });

  it('a signed-out authorize goes to /sign-in carrying the signed query', async () => {
    const harness = h();
    const clientId = await harness.registerPublic();
    const a = await harness.call(harness.authorizeUrl(clientId).url, { headers: { accept: 'text/html' } });
    expect(a.status).toBe(302);
    expect(pathOf(a.location!)).toBe('/sign-in');
    const q = new URLSearchParams(queryOf(a.location!));
    expect(q.get('client_id')).toBe(clientId);
    expect(q.get('sig')).toBeTruthy();
  });
});
