import { contact, notification } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { addContact } from '@cs/engine';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());

vi.mock('@/server/db', () => ({ dbs: () => ({ app: dbs.app, service: dbs.service }) }));
const env = vi.hoisted(() => ({ secret: 'pm-secret' as string | undefined }));
vi.mock('@/server/env', () => ({ webEnv: () => ({ postmarkWebhookSecret: env.secret }) }));

const { POST } = await import('./route');

const MSG = 'b7bc2f4a-e38e-4336-af7d-e6c392c2f817';
const AUTH = `Basic ${Buffer.from('postmark:pm-secret').toString('base64')}`;
const post = (body: unknown, auth: string | null = AUTH) =>
  POST(new Request('http://localhost/api/postmark/webhook', {
    method: 'POST', headers: { 'content-type': 'application/json', ...(auth === null ? {} : { authorization: auth }) }, body: typeof body === 'string' ? body : JSON.stringify(body),
  }));
const bounce = (over: Record<string, unknown> = {}) => ({ RecordType: 'Bounce', Type: 'HardBounce', TypeCode: 1, MessageID: MSG, Email: 'owner@a1.example', ...over });
const notices = () => dbs.owner.select().from(notification).where(eq(notification.kind, 'contact_bounced'));
let owner: string;
const ownerActive = async () => (await dbs.owner.select({ active: contact.active }).from(contact).where(eq(contact.id, owner)))[0]!.active;

beforeEach(async () => {
  env.secret = 'pm-secret';
  vi.stubEnv('APP_URL', 'https://app.example');
  vi.stubEnv('LINK_SIGNING_SECRET', 's'.repeat(32));
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
  await addContact(dbs.service, { agencyId: IDS.agencyA, role: 'account_manager', email: 'am@a.example', name: 'Sam' });
  owner = await addContact(dbs.service, { agencyId: IDS.agencyA, clientId: IDS.clientA1, role: 'client_owner', email: 'Owner@A1.example' });
  await dbs.owner.insert(notification).values({
    agencyId: IDS.agencyA, clientId: IDS.clientA1, contactId: owner, channel: 'email', kind: 'brief', subjectType: 'brief', subjectId: IDS.clientA1,
    dedupeKey: 'brief:x', title: 't', body: 'b', address: 'Owner@A1.example', status: 'sent', providerId: MSG,
  });
  return () => vi.unstubAllEnvs();
});

describe('POST /api/postmark/webhook', () => {
  it('401 on missing/wrong auth', async () => {
    expect((await post(bounce(), null)).status).toBe(401);
    expect((await post(bounce(), `Basic ${Buffer.from('postmark:wrong').toString('base64')}`)).status).toBe(401);
    expect((await post(bounce(), 'Bearer pm-secret')).status).toBe(401);
    expect(await ownerActive()).toBe(true);
  });

  it('404 when secret unset', async () => {
    env.secret = undefined;
    expect((await post(bounce())).status).toBe(404);
    expect(await ownerActive()).toBe(true);
  });

  it('hard bounce with a mixed-case address deactivates the contact and notifies the agency once, even when retried', async () => {
    const r1 = await post(bounce({ Email: 'OWNER@a1.Example' }));
    expect(r1.status).toBe(200);
    expect(await ownerActive()).toBe(false);
    const first = await notices();
    expect(first.filter((n) => n.channel === 'in_app')).toHaveLength(1);
    expect((await post(bounce({ Email: 'OWNER@a1.Example' }))).status).toBe(200);
    expect(await notices()).toHaveLength(first.length);
  });

  it('unknown MessageID ignored, 200', async () => {
    expect((await post(bounce({ MessageID: 'someone-else' }))).status).toBe(200);
    expect(await ownerActive()).toBe(true);
    expect(await notices()).toHaveLength(0);
  });

  it('soft bounce ignored, 200', async () => {
    expect((await post(bounce({ Type: 'SoftBounce' }))).status).toBe(200);
    expect(await ownerActive()).toBe(true);
    expect(await notices()).toHaveLength(0);
  });

  it('invalid JSON after auth is 200 and changes nothing', async () => {
    expect((await post('{nope')).status).toBe(200);
    expect(await ownerActive()).toBe(true);
  });
});
