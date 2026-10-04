import { type LinkTarget, MIN_LINK_SECRET_LENGTH, signLink } from '@cs/core';
import { agency, agencyWebhook, type Channel, type Db, notification, type NotificationKind } from '@cs/db';
import { type Branding, type EmailPayload, type EmailTransport, PermanentEmailError, renderEmail, resolveBranding } from '@cs/email';
import { and, eq, isNull, or, sql } from 'drizzle-orm';
import { type Audience, type Conn, type Recipient, recipientsFor, replyToFor } from './contacts';
import { quietUntil } from './time';

export interface DeliveryConfig {
  appUrl: string;
  /** Current signing secret first, then previous ones still accepted during rotation (only the first signs). */
  linkSecrets: string[];
  /** MVP sending address (the owning agency's domain, spec §9.4). */
  fromAddress: string;
}

export function deliveryConfigFromEnv(env: NodeJS.ProcessEnv): DeliveryConfig | null {
  const secret = env.LINK_SIGNING_SECRET ?? '';
  if (!env.APP_URL || secret.length < MIN_LINK_SECRET_LENGTH) return null;
  const appUrl = env.APP_URL.replace(/\/+$/, '');
  const previous = env.LINK_SIGNING_SECRET_PREVIOUS && env.LINK_SIGNING_SECRET_PREVIOUS.length >= MIN_LINK_SECRET_LENGTH ? [env.LINK_SIGNING_SECRET_PREVIOUS] : [];
  return { appUrl, linkSecrets: [secret, ...previous], fromAddress: env.EMAIL_FROM || `briefs@${new URL(appUrl).hostname}` };
}

/** A signed link for one contact (decision 5); Phase 5 serves /l/<token>. */
export function personalLink(cfg: DeliveryConfig, contactId: string, scope: { agencyId: string; clientId: string }, t: LinkTarget, id: string, now: Date): string {
  return `${cfg.appUrl}/l/${signLink(cfg.linkSecrets[0]!, { sub: contactId, agency: scope.agencyId, client: scope.clientId, t, id }, now)}`;
}
/** Shared channels (Slack/Teams) never carry a token: Phase 5 serves /go/<target>/<id> behind login. */
export const plainLink = (cfg: DeliveryConfig, t: LinkTarget, id: string) => `${cfg.appUrl}/go/${t}/${id}`;

export async function loadBranding(db: Conn, agencyId: string): Promise<Branding> {
  const [a] = await db.select({ name: agency.name, branding: agency.branding }).from(agency).where(eq(agency.id, agencyId));
  if (!a) throw new Error(`agency ${agencyId} not found`);
  return resolveBranding(a.name, a.branding ?? null);
}

export interface NotifyInput {
  agencyId: string;
  clientId: string;
  kind: NotificationKind;
  audience: Audience;
  subjectType: 'alert' | 'brief' | 'digest' | 'trend_report';
  subjectId: string;
  /** Stable for this message; the recipient and channel are appended to make each row's dedupe key. */
  dedupe: string;
  link: { t: LinkTarget; id: string };
  now: Date;
  /** Text for in-app/webhook rows and the email payload; `r` is null for a webhook. */
  build: (r: Recipient | null, link: string) => { title: string; body: string; email: EmailPayload | null };
}

/**
 * Writes the outbox rows for one message (decision 3). Call it inside the transaction that makes the state change, so
 * the message exists exactly when the change commits. In-app rows are the inbox and are stored already 'sent'.
 */
export async function notify(conn: Conn, cfg: DeliveryConfig, input: NotifyInput): Promise<number> {
  const recipients = await recipientsFor(conn, input);
  const replyTo = input.audience === 'client' ? (await replyToFor(conn, input.agencyId, input.clientId))?.email ?? null : null;
  const scope = { agencyId: input.agencyId, clientId: input.clientId };
  const base = { agencyId: input.agencyId, clientId: input.clientId, kind: input.kind, subjectType: input.subjectType, subjectId: input.subjectId };
  const values: (typeof notification.$inferInsert)[] = [];
  for (const r of recipients) {
    const link = personalLink(cfg, r.contactId, scope, input.link.t, input.link.id, input.now);
    const draft = input.build(r, link);
    for (const channel of r.channels) {
      const key = `${input.dedupe}:${r.contactId}:${channel}`;
      if (channel === 'in_app') {
        values.push({ ...base, contactId: r.contactId, channel, dedupeKey: key, title: draft.title, body: draft.body, link, status: 'sent', notBefore: input.now, sentAt: input.now });
      } else if (draft.email) {
        values.push({
          ...base, contactId: r.contactId, channel, dedupeKey: key, title: draft.title, body: draft.body, link, address: r.email,
          payload: { ...draft.email, replyTo } as Record<string, unknown>, status: 'pending', notBefore: quietUntil(input.now, r.timezone, r.quietHours) ?? input.now,
        });
      }
    }
  }
  if (input.audience === 'agency') {
    const hooks = await conn
      .select({ id: agencyWebhook.id, kind: agencyWebhook.kind })
      .from(agencyWebhook)
      .where(and(eq(agencyWebhook.agencyId, input.agencyId), eq(agencyWebhook.active, true), or(isNull(agencyWebhook.kinds), sql`${agencyWebhook.kinds} ? ${input.kind}`)));
    for (const h of hooks) {
      const link = plainLink(cfg, input.link.t, input.link.id);
      const draft = input.build(null, link);
      values.push({ ...base, webhookId: h.id, channel: h.kind as Channel, dedupeKey: `${input.dedupe}:wh:${h.id}`, title: draft.title, body: draft.body, link, status: 'pending', notBefore: input.now });
    }
  }
  if (values.length === 0) return 0;
  const inserted = await conn.insert(notification).values(values).onConflictDoNothing({ target: notification.dedupeKey }).returning({ id: notification.id });
  return inserted.length;
}

export type NotificationRow = typeof notification.$inferSelect;
export interface ChannelSender {
  send(n: NotificationRow, now: Date): Promise<{ providerId: string | null }>;
}
/** The recipient or destination can never accept this message: fail it without retrying. */
export class PermanentSendError extends Error {}
export const DISPATCH_MAX_ATTEMPTS = 5;
export const SENDING_STALE_MINUTES = 10;

/** Sends due outbox rows (decision 3). One replica; SKIP LOCKED keeps a second dispatcher run from double-claiming. */
export async function dispatchDue(deps: { db: Db; senders: Partial<Record<Channel | 'sms', ChannelSender>> }, now: Date, limit = 50): Promise<{ sent: number; failed: number; retried: number }> {
  const stale = new Date(now.getTime() - SENDING_STALE_MINUTES * 60_000);
  const claimed = await deps.db
    .update(notification)
    .set({ status: 'sending', claimedAt: now, attempts: sql`${notification.attempts} + 1` })
    .where(sql`${notification.id} IN (
      SELECT id FROM notification
      WHERE channel <> 'in_app'
        AND ((status = 'pending' AND not_before <= ${now.toISOString()}::timestamptz) OR (status = 'sending' AND claimed_at < ${stale.toISOString()}::timestamptz))
      ORDER BY not_before, id LIMIT ${limit} FOR UPDATE SKIP LOCKED)`)
    .returning();
  const out = { sent: 0, failed: 0, retried: 0 };
  for (const n of claimed) {
    const mine = and(eq(notification.id, n.id), eq(notification.status, 'sending'), eq(notification.claimedAt, now));
    try {
      const sender = deps.senders[n.channel as Channel | 'sms'];
      if (!sender) throw new PermanentSendError(`no sender for channel ${n.channel}`);
      const r = await sender.send(n, now);
      await deps.db.update(notification).set({ status: 'sent', sentAt: now, providerId: r.providerId, error: null }).where(mine);
      out.sent++;
    } catch (err) {
      const error = (err instanceof Error ? err.message : String(err)).slice(0, 1000);
      if (err instanceof PermanentSendError || n.attempts >= DISPATCH_MAX_ATTEMPTS) {
        await deps.db.update(notification).set({ status: 'failed', error }).where(mine);
        console.warn(`[notify] ${n.channel} notification ${n.id} failed: ${error}`);
        out.failed++;
      } else {
        await deps.db.update(notification).set({ status: 'pending', error, notBefore: new Date(now.getTime() + 2 ** n.attempts * 60_000) }).where(mine);
        out.retried++;
      }
    }
  }
  return out;
}

const quoteName = (s: string) => `"${s.replace(/["\\\r\n]/g, '')}"`;

export function createEmailSender(opts: { transport: EmailTransport; fromAddress: string }): ChannelSender {
  return {
    async send(n) {
      const p = n.payload as (EmailPayload & { replyTo: string | null }) | null;
      if (!p || !n.address) throw new PermanentSendError('email notification without payload or address');
      const r = await renderEmail(p);
      const b = p.props.branding;
      try {
        const res = await opts.transport.send(
          { from: `${quoteName(b.fromName)} <${b.fromEmail ?? opts.fromAddress}>`, to: n.address, replyTo: p.replyTo, subject: r.subject, html: r.html, text: r.text, tag: n.kind, metadata: { notification: n.id } },
          { agencyId: n.agencyId, clientId: n.clientId },
        );
        return { providerId: res.providerId };
      } catch (err) {
        if (err instanceof PermanentEmailError) throw new PermanentSendError(err.message);
        throw err;
      }
    },
  };
}
