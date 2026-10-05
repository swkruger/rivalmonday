import { contact, invitation, membership } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, testUrls, truncateAll } from '@cs/db/test-helpers';
import { createMemoryTransport, renderEmail, resolveBranding } from '@cs/email';
import { betterAuth } from 'better-auth';
import { sql } from 'drizzle-orm';
import { Pool } from 'pg';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { truncateAuth } from '../../test/auth-fixtures';
import { buildAuthOptions } from './auth-options';
import type { WebEnv } from './env';

const dbs = openTestDbs();
const pool = new Pool({ connectionString: testUrls.service });
afterAll(async () => {
  await pool.end();
  await dbs.closeAll();
});

const env: WebEnv = {
  appUrl: 'http://localhost:3000', appDatabaseUrl: testUrls.app, serviceDatabaseUrl: testUrls.service, queueDatabaseUrl: testUrls.owner,
  authSecret: 's'.repeat(40), linkSecrets: ['l'.repeat(40)], emailFrom: 'from@example.com', google: null, defaultAgencyId: null,
};
const mail = createMemoryTransport();
const auth = betterAuth(buildAuthOptions({
  env, service: dbs.service, pool,
  branding: async () => resolveBranding('Rival Monday', null),
  sendEmail: async (to, payload) => {
    const r = await renderEmail(payload);
    await mail.send({ from: env.emailFrom, to, replyTo: null, subject: r.subject, html: r.html, text: r.text, tag: 'sign_in', metadata: {} }, { agencyId: null, clientId: null });
  },
}));

const post = (path: string, body: unknown) =>
  auth.handler(new Request(`http://localhost:3000/api/auth${path}`, { method: 'POST', headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' }, body: JSON.stringify(body) }));
const linkFromMail = () => /https?:\/\/[^\s"]+magic-link\/verify[^\s"]+/.exec(mail.sent.at(-1)!.text)![0];

beforeEach(async () => {
  mail.sent.length = 0;
  await truncateAll(dbs.owner);
  await truncateAuth(dbs.owner);
  await seedTenancy(dbs.owner);
});

describe('magic link sign-in', () => {
  it('sends nothing for an uninvited email but answers the same way', async () => {
    const res = await post('/sign-in/magic-link', { email: 'stranger@example.com', callbackURL: '/' });
    expect(res.status).toBe(200);
    expect(mail.sent).toHaveLength(0);
  });

  it('signs in an invited user, creating the user and accepting the invitation', async () => {
    await dbs.service.insert(invitation).values({ agencyId: IDS.agencyA, email: 'new@example.com', role: 'agency_admin', invitedBy: 't', expiresAt: new Date(Date.now() + 86_400_000) });
    expect((await post('/sign-in/magic-link', { email: 'New@Example.com', callbackURL: '/' })).status).toBe(200);
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
    await dbs.service.update(invitation).set({ revokedAt: new Date() });
    const verify = await auth.handler(new Request(linkFromMail()));
    expect(verify.headers.get('set-cookie') ?? '').not.toMatch(/session_token=[^;]+;/);
    expect((await dbs.owner.execute(sql`select count(*)::int as n from auth."user"`))[0]).toMatchObject({ n: 0 });
  });
});
