import { agencyWebhook, type Db } from '@cs/db';
import { eq } from 'drizzle-orm';
import { type ChannelSender, type NotificationRow, PermanentSendError } from './outbox';
import { webhookUrlProblem } from './settings';

const slackEscape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function slackPayload(n: { title: string; body: string; link: string | null }): object {
  return { text: `*${slackEscape(n.title)}*\n${slackEscape(n.body)}${n.link ? `\n<${n.link}|Open>` : ''}` };
}

/** Teams Workflows ("Post to a channel when a webhook request is received") accepts an adaptive-card message. */
export function teamsPayload(n: { title: string; body: string; link: string | null }): object {
  return {
    type: 'message',
    attachments: [{
      contentType: 'application/vnd.microsoft.card.adaptive',
      content: {
        $schema: 'http://adaptivecards.io/schemas/adaptive-card.json', type: 'AdaptiveCard', version: '1.4',
        body: [{ type: 'TextBlock', text: n.title, weight: 'Bolder', wrap: true }, { type: 'TextBlock', text: n.body, wrap: true }],
        actions: n.link ? [{ type: 'Action.OpenUrl', title: 'Open', url: n.link }] : [],
      },
    }],
  };
}

export type WebhookPostResult = { ok: true; status: number } | { ok: false; status?: number; error: 'timeout' | 'blocked' | 'http' | 'network' };

/**
 * One POST to a Slack/Teams webhook (15c-2a B9), shared by the outbox sender and the settings "Send test". The host
 * allow-list runs first (a refused URL is never fetched); redirects are never followed (a 3xx is an `http` failure);
 * the timeout is enforced here even if `fetch` ignores the abort signal.
 */
export async function postWebhook(kind: 'slack' | 'teams', url: string, msg: { title: string; body: string; link: string | null }, o: { fetch?: typeof fetch; timeoutMs: number }): Promise<WebhookPostResult> {
  if (webhookUrlProblem(kind, url)) return { ok: false, error: 'blocked' };
  const doFetch = o.fetch ?? fetch;
  const signal = AbortSignal.timeout(o.timeoutMs);
  const timedOut = new Promise<never>((_, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
  const body = kind === 'slack' ? slackPayload(msg) : teamsPayload(msg);
  let res: Response;
  try {
    res = await Promise.race([
      doFetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), redirect: 'manual', signal }),
      timedOut,
    ]);
  } catch {
    return { ok: false, error: signal.aborted ? 'timeout' : 'network' };
  }
  void res.body?.cancel().catch(() => {});
  if (res.status >= 200 && res.status < 300) return { ok: true, status: res.status };
  return { ok: false, status: res.status, error: 'http' };
}

/** Agency Slack/Teams channels (spec §9.3). The URL is re-checked against the policy before every send (decision 20). */
export function createWebhookSender(deps: { db: Db; fetch?: typeof fetch }): ChannelSender {
  return {
    async send(n: NotificationRow) {
      if (!n.webhookId) throw new PermanentSendError('webhook notification without a webhook');
      const [h] = await deps.db.select().from(agencyWebhook).where(eq(agencyWebhook.id, n.webhookId));
      if (!h || !h.active) throw new PermanentSendError('webhook is gone or inactive');
      const kind = h.kind as 'slack' | 'teams';
      const problem = webhookUrlProblem(kind, h.url);
      if (problem) throw new PermanentSendError(`webhook URL refused: ${problem}`);
      const r = await postWebhook(kind, h.url, n, { ...(deps.fetch ? { fetch: deps.fetch } : {}), timeoutMs: 10_000 });
      if (r.ok) return { providerId: null };
      if (r.error === 'blocked') throw new PermanentSendError('webhook URL refused');
      if (r.error === 'timeout') throw new Error('webhook timed out');
      if (r.error === 'network') throw new Error('webhook network error');
      const status = r.status ?? 0;
      if (status >= 300 && status < 400) throw new PermanentSendError(`webhook redirect refused (${status})`);
      if (status === 400 || status === 403 || status === 404 || status === 410) throw new PermanentSendError(`webhook rejected the message (${status})`);
      throw new Error(`webhook ${status}`);
    },
  };
}
