import { agencyWebhook } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { PermanentSendError } from './outbox';
import { createWebhookSender, slackPayload, teamsPayload } from './webhooks';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
});
const NOW = new Date('2026-10-05T12:00:00Z');
async function hook(url = 'https://hooks.slack.com/services/T/B/X', kind = 'slack', active = true) {
  const [h] = await dbs.service.insert(agencyWebhook).values({ agencyId: IDS.agencyA, kind, url, active, createdBy: 'x' }).returning({ id: agencyWebhook.id });
  return h!.id;
}
const row = (webhookId: string, channel = 'slack') => ({ id: 'n1', webhookId, channel, title: 'Brief ready: <A1 & Co>', body: 'Three items.', link: 'https://app.example/go/brief/b1' }) as never;

describe('payloads', () => {
  it('escapes Slack control characters and links the deep link', () => {
    expect(slackPayload({ title: 'A <b> & c', body: 'x', link: 'https://app.example/go/a/1' })).toEqual({ text: '*A &lt;b&gt; &amp; c*\nx\n<https://app.example/go/a/1|Open>' });
  });
  it('builds a Teams adaptive card', () => {
    const p = teamsPayload({ title: 'T', body: 'B', link: 'https://app.example/go/a/1' }) as { attachments: { contentType: string; content: { actions: { url: string }[] } }[] };
    expect(p.attachments[0]!.contentType).toBe('application/vnd.microsoft.card.adaptive');
    expect(p.attachments[0]!.content.actions[0]!.url).toBe('https://app.example/go/a/1');
  });
});

describe('webhook sender', () => {
  it('posts JSON to the stored URL without following redirects', async () => {
    const id = await hook();
    let seen: { url: string; init: RequestInit } | null = null;
    const fetch = (async (url: string, init: RequestInit) => ((seen = { url, init }), new Response('ok', { status: 200 }))) as unknown as typeof globalThis.fetch;
    await createWebhookSender({ db: dbs.service, fetch }).send(row(id), NOW);
    expect(seen!.url).toBe('https://hooks.slack.com/services/T/B/X');
    expect(seen!.init.redirect).toBe('manual');
    expect(JSON.parse(String(seen!.init.body)).text).toContain('Brief ready: &lt;A1 &amp; Co&gt;');
  });

  it('fails permanently for an inactive webhook, a URL outside the policy, a gone webhook or a redirect', async () => {
    const never = (async () => { throw new Error('must not fetch'); }) as unknown as typeof fetch;
    const inactive = await hook('https://hooks.slack.com/services/T/B/Y', 'slack', false);
    await expect(createWebhookSender({ db: dbs.service, fetch: never }).send(row(inactive), NOW)).rejects.toBeInstanceOf(PermanentSendError);
    const tampered = await hook();
    await dbs.owner.update(agencyWebhook).set({ url: 'https://169.254.169.254/latest' }).where(eq(agencyWebhook.id, tampered));
    await expect(createWebhookSender({ db: dbs.service, fetch: never }).send(row(tampered), NOW)).rejects.toBeInstanceOf(PermanentSendError);
    const ok = await hook('https://hooks.slack.com/services/T/B/Z');
    const gone = (async () => new Response('', { status: 410 })) as unknown as typeof fetch;
    await expect(createWebhookSender({ db: dbs.service, fetch: gone }).send(row(ok), NOW)).rejects.toBeInstanceOf(PermanentSendError);
    const redirect = (async () => new Response('', { status: 302, headers: { location: 'http://10.0.0.1/' } })) as unknown as typeof fetch;
    await expect(createWebhookSender({ db: dbs.service, fetch: redirect }).send(row(ok), NOW)).rejects.toBeInstanceOf(PermanentSendError);
  });

  it('treats a server error as transient', async () => {
    const id = await hook();
    const down = (async () => new Response('', { status: 503 })) as unknown as typeof fetch;
    const err = await createWebhookSender({ db: dbs.service, fetch: down }).send(row(id), NOW).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(PermanentSendError);
  });
});
