import { verifyLink } from '@cs/core';
import { agencyWebhook, client, notification } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { createMemoryTransport, type EmailPayload, PermanentEmailError, resolveBranding } from '@cs/email';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { addContact } from './contacts';
import { type ChannelSender, createEmailSender, type DeliveryConfig, dispatchDue, notify, type NotifyInput, PermanentSendError } from './outbox';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const cfg: DeliveryConfig = { appUrl: 'https://app.example', linkSecrets: ['s'.repeat(32)], fromAddress: 'briefs@agency.example' };
const NOW = new Date('2026-10-06T06:30:00Z'); // 23:30 PDT Monday
const branding = resolveBranding('Agency A', null);
const payload = (link: string): EmailPayload => ({ template: 'alert', props: { branding, recipientName: null, clientName: 'A1 HVAC', competitorName: 'Smith HVAC', headline: 'H', body: 'B', detectedOn: '2026-10-05', link } });
const input = (o: Partial<NotifyInput> = {}): NotifyInput => ({
  agencyId: IDS.agencyA, clientId: IDS.clientA1, kind: 'alert', audience: 'client', subjectType: 'alert', subjectId: IDS.clientA1, dedupe: 'alert:1',
  link: { t: 'alert', id: IDS.clientA1 }, now: NOW, build: (_r, link) => ({ title: 'H', body: 'B', email: payload(link) }), ...o,
});
const rows = () => dbs.owner.select().from(notification).orderBy(notification.channel, notification.createdAt);

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
  await dbs.owner.update(client).set({ timezone: 'America/Los_Angeles' }).where(eq(client.id, IDS.clientA1));
});

describe('notify', () => {
  it('writes an in-app row (already sent) and a pending email per recipient, each with a signed personal link, once', async () => {
    const owner = await addContact(dbs.service, { agencyId: IDS.agencyA, clientId: IDS.clientA1, role: 'client_owner', email: 'owner@a1.example' });
    expect(await notify(dbs.service, cfg, input())).toBe(2);
    expect(await notify(dbs.service, cfg, input())).toBe(0); // dedupe
    const [email, inApp] = await rows();
    expect(inApp).toMatchObject({ channel: 'in_app', status: 'sent', contactId: owner, title: 'H' });
    expect(email).toMatchObject({ channel: 'email', status: 'pending', address: 'owner@a1.example' });
    const token = email!.link!.replace('https://app.example/l/', '');
    expect(verifyLink(cfg.linkSecrets, token, NOW)).toMatchObject({ sub: owner, client: IDS.clientA1, t: 'alert' });
  });

  it('defers email (not in-app) to the end of the recipient quiet hours', async () => {
    await addContact(dbs.service, { agencyId: IDS.agencyA, clientId: IDS.clientA1, role: 'client_owner', email: 'o@a1.example', quietHours: { start: '21:00', end: '07:00' } });
    await notify(dbs.service, cfg, input());
    const [email, inApp] = await rows();
    expect(email!.notBefore.toISOString()).toBe('2026-10-06T14:00:00.000Z'); // 07:00 PDT
    expect(inApp!.notBefore.getTime()).toBeLessThanOrEqual(NOW.getTime() + 1000);
  });

  it('adds agency webhooks for agency kinds only, with plain links and the kind filter applied', async () => {
    await addContact(dbs.service, { agencyId: IDS.agencyA, role: 'account_manager', email: 'am@a.example' });
    await dbs.service.insert(agencyWebhook).values([
      { agencyId: IDS.agencyA, kind: 'slack', url: 'https://hooks.slack.com/services/T/B/X', createdBy: 'x' },
      { agencyId: IDS.agencyA, kind: 'teams', url: 'https://a.webhook.office.com/x', kinds: ['brief_ready'], createdBy: 'x' },
    ]);
    await notify(dbs.service, cfg, input({ kind: 'am_alert', audience: 'agency', dedupe: 'am:1' }));
    const r = await rows();
    expect(r.map((x) => x.channel).sort()).toEqual(['email', 'in_app', 'slack']);
    expect(r.find((x) => x.channel === 'slack')!.link).toBe(`https://app.example/go/alert/${IDS.clientA1}`);
    await notify(dbs.service, cfg, input({ dedupe: 'alert:2' })); // client kind: never a webhook
    expect((await rows()).filter((x) => x.channel === 'slack')).toHaveLength(1);
  });

  it('leaves nothing behind when the surrounding transaction rolls back', async () => {
    await addContact(dbs.service, { agencyId: IDS.agencyA, clientId: IDS.clientA1, role: 'client_owner', email: 'o@a1.example' });
    await dbs.service.transaction(async (tx) => {
      await notify(tx, cfg, input());
      tx.rollback();
    }).catch(() => {});
    expect(await rows()).toEqual([]);
  });
});

describe('dispatchDue', () => {
  async function pendingEmail(o: Partial<typeof notification.$inferInsert> = {}) {
    const c = await addContact(dbs.service, { agencyId: IDS.agencyA, clientId: IDS.clientA1, role: 'client_owner', email: `o${Math.random()}@a1.example` });
    const [n] = await dbs.service.insert(notification).values({
      agencyId: IDS.agencyA, clientId: IDS.clientA1, contactId: c, channel: 'email', kind: 'alert', subjectType: 'alert', subjectId: IDS.clientA1,
      dedupeKey: `k${Math.random()}`, title: 'H', body: 'B', address: 'o@a1.example', payload: { ...payload('https://app.example/l/x'), replyTo: null }, status: 'pending', notBefore: NOW, ...o,
    }).returning();
    return n!;
  }
  const sender = (fn: ChannelSender['send']): ChannelSender => ({ send: fn });

  it('sends due rows and records the provider id; leaves future and in-app rows alone', async () => {
    const due = await pendingEmail();
    const later = await pendingEmail({ notBefore: new Date(NOW.getTime() + 60_000) });
    const r = await dispatchDue({ db: dbs.service, senders: { email: sender(async () => ({ providerId: 'p1' })) } }, NOW);
    expect(r).toEqual({ sent: 1, failed: 0, retried: 0 });
    const [d] = await dbs.owner.select().from(notification).where(eq(notification.id, due.id));
    expect(d).toMatchObject({ status: 'sent', providerId: 'p1', attempts: 1 });
    expect((await dbs.owner.select().from(notification).where(eq(notification.id, later.id)))[0]!.status).toBe('pending');
  });

  it('retries a transient failure with backoff, then fails after the last attempt', async () => {
    const n = await pendingEmail();
    const flaky = { email: sender(async () => { throw new Error('503'); }) };
    expect(await dispatchDue({ db: dbs.service, senders: flaky }, NOW)).toEqual({ sent: 0, failed: 0, retried: 1 });
    let [row] = await dbs.owner.select().from(notification).where(eq(notification.id, n.id));
    expect(row).toMatchObject({ status: 'pending', attempts: 1, error: '503' });
    expect(row!.notBefore.toISOString()).toBe(new Date(NOW.getTime() + 2 * 60_000).toISOString());
    await dbs.owner.update(notification).set({ attempts: 4, notBefore: NOW }).where(eq(notification.id, n.id));
    expect(await dispatchDue({ db: dbs.service, senders: flaky }, NOW)).toEqual({ sent: 0, failed: 1, retried: 0 });
    [row] = await dbs.owner.select().from(notification).where(eq(notification.id, n.id));
    expect(row).toMatchObject({ status: 'failed', attempts: 5 });
  });

  it('fails a permanent error at once and a channel without a sender', async () => {
    await pendingEmail();
    await pendingEmail({ channel: 'sms' });
    const r = await dispatchDue({ db: dbs.service, senders: { email: sender(async () => { throw new PermanentSendError('inactive recipient'); }) } }, NOW);
    expect(r).toEqual({ sent: 0, failed: 2, retried: 0 });
  });

  it('re-claims a row stuck in sending only after 10 minutes', async () => {
    const n = await pendingEmail({ status: 'sending', claimedAt: new Date(NOW.getTime() - 9 * 60_000), attempts: 1 });
    const ok = { email: sender(async () => ({ providerId: 'p' })) };
    expect((await dispatchDue({ db: dbs.service, senders: ok }, NOW)).sent).toBe(0);
    await dbs.owner.update(notification).set({ claimedAt: new Date(NOW.getTime() - 11 * 60_000) }).where(eq(notification.id, n.id));
    expect((await dispatchDue({ db: dbs.service, senders: ok }, NOW)).sent).toBe(1);
  });
});

describe('email sender', () => {
  it('renders the payload and sends from the agency name at the configured address', async () => {
    const transport = createMemoryTransport();
    const s = createEmailSender({ transport, fromAddress: 'briefs@agency.example' });
    const row = { id: 'n1', agencyId: IDS.agencyA, clientId: IDS.clientA1, kind: 'alert', address: 'o@a1.example', payload: { ...payload('https://app.example/l/x'), replyTo: 'am@a.example' } } as never;
    await s.send(row, NOW);
    expect(transport.sent[0]).toMatchObject({ from: '"Agency A" <briefs@agency.example>', to: 'o@a1.example', replyTo: 'am@a.example', subject: 'H', tag: 'alert', metadata: { notification: 'n1' } });
  });

  it('turns a permanent transport error into a permanent send error', async () => {
    const s = createEmailSender({ transport: { kind: 'memory', send: async () => { throw new PermanentEmailError('406'); } }, fromAddress: 'b@a.example' });
    const row = { id: 'n1', agencyId: IDS.agencyA, clientId: IDS.clientA1, kind: 'alert', address: 'o@a1.example', payload: { ...payload('x'), replyTo: null } } as never;
    await expect(s.send(row, NOW)).rejects.toBeInstanceOf(PermanentSendError);
  });
});
