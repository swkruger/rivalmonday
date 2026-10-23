import { agencyWebhook } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { PermanentSendError } from './outbox';
import { createWebhookSender, postWebhook, slackPayload, teamsPayload } from './webhooks';

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

describe('postWebhook', () => {
  const MSG = { title: 'Test message from Peak', body: 'Briefs and alerts from Peak will appear in this channel.', link: null };
  const SLACK = 'https://hooks.slack.com/services/T/B/X';
  const TEAMS = 'https://acme.webhook.office.com/webhookb2/abc';
  type Seen = { url: string; init: RequestInit };
  const capture = (status = 200) => {
    const seen: Seen[] = [];
    const f = (async (url: string, init: RequestInit) => (seen.push({ url, init }), new Response('ok', { status }))) as unknown as typeof fetch;
    return { seen, f };
  };

  it('postWebhook blocked URL never fetches', async () => {
    const never = (async () => { throw new Error('must not fetch'); }) as unknown as typeof fetch;
    for (const [kind, url] of [['slack', 'http://hooks.slack.com/services/T/B/X'], ['slack', 'https://169.254.169.254/latest'], ['teams', SLACK], ['slack', 'https://hooks.slack.com:8443/x'], ['teams', 'not a url']] as const)
      expect(await postWebhook(kind, url, MSG, { fetch: never, timeoutMs: 5000 }), url).toEqual({ ok: false, error: 'blocked' });
  });

  it('slack payload shape', async () => {
    const { seen, f } = capture();
    expect(await postWebhook('slack', SLACK, MSG, { fetch: f, timeoutMs: 5000 })).toEqual({ ok: true, status: 200 });
    expect(seen).toHaveLength(1);
    expect(seen[0]!.url).toBe(SLACK);
    expect(seen[0]!.init.method).toBe('POST');
    expect(seen[0]!.init.redirect).toBe('manual');
    expect((seen[0]!.init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
    expect(JSON.parse(String(seen[0]!.init.body))).toEqual({ text: '*Test message from Peak*\nBriefs and alerts from Peak will appear in this channel.' });
  });

  it('teams payload shape', async () => {
    const { seen, f } = capture(202);
    expect(await postWebhook('teams', TEAMS, MSG, { fetch: f, timeoutMs: 5000 })).toEqual({ ok: true, status: 202 });
    const body = JSON.parse(String(seen[0]!.init.body)) as { type: string; attachments: { contentType: string; content: { body: { text: string }[]; actions: unknown[] } }[] };
    expect(body.type).toBe('message');
    expect(body.attachments[0]!.contentType).toBe('application/vnd.microsoft.card.adaptive');
    expect(body.attachments[0]!.content.body.map((b) => b.text)).toEqual([MSG.title, MSG.body]);
    expect(body.attachments[0]!.content.actions).toEqual([]);
  });

  it('redirect is a failure (status 302, error http)', async () => {
    const calls: string[] = [];
    const redirect = (async (url: string) => (calls.push(url), new Response('', { status: 302, headers: { location: 'http://10.0.0.1/' } }))) as unknown as typeof fetch;
    expect(await postWebhook('slack', SLACK, MSG, { fetch: redirect, timeoutMs: 5000 })).toEqual({ ok: false, status: 302, error: 'http' });
    expect(calls).toEqual([SLACK]);
    const { f } = capture(500);
    expect(await postWebhook('slack', SLACK, MSG, { fetch: f, timeoutMs: 5000 })).toEqual({ ok: false, status: 500, error: 'http' });
  });

  it('5 s timeout → timeout', async () => {
    // A receiver that never answers and ignores the abort signal: postWebhook must still give up on its own clock.
    const hang = (() => new Promise<Response>(() => {})) as unknown as typeof fetch;
    const started = Date.now();
    expect(await postWebhook('teams', TEAMS, MSG, { fetch: hang, timeoutMs: 50 })).toEqual({ ok: false, error: 'timeout' });
    expect(Date.now() - started).toBeLessThan(2000);
    let signal: AbortSignal | undefined;
    const honours = ((_u: string, init: RequestInit) => new Promise<Response>((_, reject) => { signal = init.signal!; signal.addEventListener('abort', () => reject(signal!.reason)); })) as unknown as typeof fetch;
    expect(await postWebhook('slack', SLACK, MSG, { fetch: honours, timeoutMs: 50 })).toEqual({ ok: false, error: 'timeout' });
    expect(signal!.aborted).toBe(true);
  });

  it('network error → network', async () => {
    const down = (async () => { throw new TypeError('fetch failed'); }) as unknown as typeof fetch;
    expect(await postWebhook('slack', SLACK, MSG, { fetch: down, timeoutMs: 5000 })).toEqual({ ok: false, error: 'network' });
  });
});
