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

/** Agency Slack/Teams channels (spec §9.3). The URL is re-checked against the policy before every send (decision 20). */
export function createWebhookSender(deps: { db: Db; fetch?: typeof fetch }): ChannelSender {
  const doFetch = deps.fetch ?? fetch;
  return {
    async send(n: NotificationRow) {
      if (!n.webhookId) throw new PermanentSendError('webhook notification without a webhook');
      const [h] = await deps.db.select().from(agencyWebhook).where(eq(agencyWebhook.id, n.webhookId));
      if (!h || !h.active) throw new PermanentSendError('webhook is gone or inactive');
      const kind = h.kind as 'slack' | 'teams';
      const problem = webhookUrlProblem(kind, h.url);
      if (problem) throw new PermanentSendError(`webhook URL refused: ${problem}`);
      const body = kind === 'slack' ? slackPayload(n) : teamsPayload(n);
      const res = await doFetch(h.url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), redirect: 'manual', signal: AbortSignal.timeout(10_000) });
      if (res.status >= 200 && res.status < 300) return { providerId: null };
      if (res.status >= 300 && res.status < 400) throw new PermanentSendError(`webhook redirect refused (${res.status})`);
      if (res.status === 400 || res.status === 403 || res.status === 404 || res.status === 410) throw new PermanentSendError(`webhook rejected the message (${res.status})`);
      throw new Error(`webhook ${res.status}`);
    },
  };
}
