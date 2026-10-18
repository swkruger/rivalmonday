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
  /** Phase 10: `broadcast` = the opt-out stream (setup tips); default `outbound` (transactional). */
  stream?: 'outbound' | 'broadcast';
  /** Phase 10: extra headers, e.g. `List-Unsubscribe` on broadcast mail. */
  headers?: { Name: string; Value: string }[];
  /** Phase 11b §3: copied addresses — always pass through `cleanCc` (Postmark rejects the whole message on one bad Cc). */
  cc?: string[];
}
export interface EmailTransport {
  readonly kind: 'postmark' | 'file' | 'memory' | 'console';
  send(msg: OutgoingEmail, scope: CallScope): Promise<{ providerId: string }>;
}
/** The address can never receive this message (invalid, inactive, suppressed): do not retry. */
export class PermanentEmailError extends Error {}

/** 11b constraint: at most this many Cc addresses per message. */
export const MAX_CC = 5;
/**
 * Deliberately strict: no spaces, commas, angle brackets, quotes or semicolons in the local part; the domain is ≥ 2
 * dot-separated (ASCII/punycode) labels, each non-empty with no leading/trailing hyphen (Postmark rejects the whole
 * message on one bad Cc, losing the `to` send). Input is already lower-cased.
 */
const CC_EMAIL = /^[^@\s,;<>"'()[\]\\]+@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

/** Lower-cased, trimmed, valid addresses only, deduped, never the `to` address, at most `MAX_CC` (cap applied after dropping). */
export function cleanCc(cc: readonly string[] | undefined, to: string): string[] {
  const self = to.trim().toLowerCase();
  const out: string[] = [];
  for (const raw of Array.isArray(cc) ? cc : []) { // a stored payload is untyped jsonb: never iterate a bare string
    if (typeof raw !== 'string') continue;
    const e = raw.trim().toLowerCase();
    if (!CC_EMAIL.test(e) || e === self || out.includes(e)) continue;
    out.push(e);
    if (out.length === MAX_CC) break;
  }
  return out;
}

export const POSTMARK_URL = 'https://api.postmarkapp.com/email';
/** Postmark's documented sandbox token: accepted, never delivered. */
export const POSTMARK_SANDBOX_TOKEN = 'POSTMARK_API_TEST';
/** Placeholder list price (~$15 per 10k); confirm with the owner's Postmark plan before costs feed budget caps. */
export const POSTMARK_USD_PER_EMAIL = 0.0015;
/** Postmark API error codes that are about the recipient, not the request or the service (300 invalid To, 406 inactive). */
const PERMANENT_CODES = new Set([300, 406]);

/** 5b-2 decision 7: a test/sandbox server accepts and logs messages but never delivers them — they must not count as spend. */
export function isPostmarkTestServer(env: NodeJS.ProcessEnv): boolean {
  return env.POSTMARK_TEST_SERVER?.trim() === 'true' || env.POSTMARK_SERVER_TOKEN?.trim() === POSTMARK_SANDBOX_TOKEN;
}

export function createPostmarkTransport(opts: { token: string; ledger: LedgerSink; fetch?: typeof fetch; messageStream?: string; broadcastStream?: string; testServer?: boolean }): EmailTransport {
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
            From: msg.from, To: msg.to, ...(msg.cc?.length && { Cc: msg.cc.join(', ') }), ReplyTo: msg.replyTo ?? undefined, Subject: msg.subject, HtmlBody: msg.html, TextBody: msg.text,
            MessageStream: msg.stream === 'broadcast' ? (opts.broadcastStream ?? 'broadcast') : (opts.messageStream ?? 'outbound'),
            TrackOpens: false, TrackLinks: 'None', Tag: msg.tag, Metadata: msg.metadata,
            ...(msg.headers?.length && { Headers: msg.headers }),
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
        await opts.ledger.recordVendorCall({ ...scope, vendor: 'postmark', operation: opts.testServer ? 'email_test' : 'email', units: 1, costUsd: ok ? (opts.testServer ? 0 : POSTMARK_USD_PER_EMAIL) : null, latencyMs: Date.now() - started, ok });
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

/** Demo spec §5.5: the dev panel's sender — prints the message, sends nothing. Only the web app's guard selects it. */
export function createConsoleTransport(log: (line: string) => void = console.log): EmailTransport {
  let n = 0;
  return {
    kind: 'console',
    async send(msg) {
      n++;
      log(`[email:console] to=${msg.to}${msg.cc?.length ? ` cc=${msg.cc.join(',')}` : ''} subject=${JSON.stringify(msg.subject)}
${msg.text}`);
      return { providerId: `console:${n}` };
    },
  };
}

export function createEmailTransportFromEnv(env: NodeJS.ProcessEnv, ledger: LedgerSink): EmailTransport {
  if (env.POSTMARK_SERVER_TOKEN) return createPostmarkTransport({ token: env.POSTMARK_SERVER_TOKEN, ledger, messageStream: env.POSTMARK_MESSAGE_STREAM || undefined, broadcastStream: env.POSTMARK_BROADCAST_STREAM?.trim() || undefined, testServer: isPostmarkTestServer(env) });
  return createFileTransport(env.EMAIL_OUTBOX_DIR || './.outbox');
}
