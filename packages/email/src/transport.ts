import type { CallScope, LedgerSink } from '@cs/core';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

export interface OutgoingEmail {
  from: string;
  to: string;
  replyTo: string | null;
  subject: string;
  html: string;
  text: string;
  tag: string;
  metadata: Record<string, string>;
}
export interface EmailTransport {
  readonly kind: 'postmark' | 'file' | 'memory';
  send(msg: OutgoingEmail, scope: CallScope): Promise<{ providerId: string }>;
}
/** The address can never receive this message (invalid, inactive, suppressed): do not retry. */
export class PermanentEmailError extends Error {}

export const POSTMARK_URL = 'https://api.postmarkapp.com/email';
/** Placeholder list price (~$15 per 10k); confirm with the owner's Postmark plan before costs feed budget caps. */
export const POSTMARK_USD_PER_EMAIL = 0.0015;
/** Postmark API error codes that are about the recipient, not the request or the service (300 invalid To, 406 inactive). */
const PERMANENT_CODES = new Set([300, 406]);

export function createPostmarkTransport(opts: { token: string; ledger: LedgerSink; fetch?: typeof fetch; messageStream?: string }): EmailTransport {
  const doFetch = opts.fetch ?? fetch;
  return {
    kind: 'postmark',
    async send(msg, scope) {
      const started = Date.now();
      let ok = false;
      try {
        const res = await doFetch(POSTMARK_URL, {
          method: 'POST',
          headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-Postmark-Server-Token': opts.token },
          // Tracking off (decision 13): link tracking would rewrite the signed deep links; open tracking adds a pixel.
          body: JSON.stringify({
            From: msg.from, To: msg.to, ReplyTo: msg.replyTo ?? undefined, Subject: msg.subject, HtmlBody: msg.html, TextBody: msg.text,
            MessageStream: opts.messageStream ?? 'outbound', TrackOpens: false, TrackLinks: 'None', Tag: msg.tag, Metadata: msg.metadata,
          }),
          signal: AbortSignal.timeout(15_000),
        });
        const body = (await res.json().catch(() => ({}))) as { ErrorCode?: number; MessageID?: string; Message?: string };
        if (res.ok && body.ErrorCode === 0 && body.MessageID) {
          ok = true;
          return { providerId: body.MessageID };
        }
        const text = `Postmark ${res.status} (code ${body.ErrorCode ?? '?'}): ${body.Message ?? 'no message'}`;
        throw res.status === 422 && PERMANENT_CODES.has(body.ErrorCode ?? -1) ? new PermanentEmailError(text) : new Error(text);
      } finally {
        await opts.ledger.recordVendorCall({ ...scope, vendor: 'postmark', operation: 'email', units: 1, costUsd: ok ? POSTMARK_USD_PER_EMAIL : null, latencyMs: Date.now() - started, ok });
      }
    },
  };
}

/** Development transport: each message becomes <stamp>-<id>.json + .html in `dir` (gitignored `.outbox/`). */
export function createFileTransport(dir: string): EmailTransport {
  return {
    kind: 'file',
    async send(msg) {
      const abs = resolve(dir);
      await mkdir(abs, { recursive: true });
      const name = `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`;
      await writeFile(join(abs, `${name}.json`), JSON.stringify({ ...msg, html: undefined }, null, 2));
      await writeFile(join(abs, `${name}.html`), msg.html);
      return { providerId: `file:${name}` };
    },
  };
}

export function createMemoryTransport(): EmailTransport & { sent: OutgoingEmail[] } {
  const sent: OutgoingEmail[] = [];
  return { kind: 'memory', sent, send: async (msg) => (sent.push(msg), { providerId: `mem:${sent.length}` }) };
}

export function createEmailTransportFromEnv(env: NodeJS.ProcessEnv, ledger: LedgerSink): EmailTransport {
  if (env.POSTMARK_SERVER_TOKEN) return createPostmarkTransport({ token: env.POSTMARK_SERVER_TOKEN, ledger, messageStream: env.POSTMARK_MESSAGE_STREAM || undefined });
  return createFileTransport(env.EMAIL_OUTBOX_DIR || './.outbox');
}
