import { timingSafeEqual } from 'node:crypto';
import { client, contact, type Db, notification } from '@cs/db';
import { and, eq, sql } from 'drizzle-orm';
import { type DeliveryConfig, loadBranding, notify } from './outbox';

export type PostmarkOutcome = 'deactivated' | 'ignored';

/** Postmark webhook Basic auth: user `postmark`, password = `POSTMARK_WEBHOOK_SECRET`; constant-time (spec §4, D19). */
export function postmarkAuthOk(header: string | null, secret: string): boolean {
  const expected = Buffer.from(`Basic ${Buffer.from(`postmark:${secret}`, 'utf8').toString('base64')}`, 'utf8');
  const got = Buffer.from(header ?? '', 'utf8');
  return got.length === expected.length && timingSafeEqual(got, expected);
}

type Reason = 'hard bounce' | 'spam complaint';

/** The deactivating events only: a hard bounce or a spam complaint with a message id and an address. */
function parse(event: unknown): { messageId: string; email: string; reason: Reason } | null {
  if (!event || typeof event !== 'object') return null;
  const e = event as Record<string, unknown>;
  const reason: Reason | null = e.RecordType === 'Bounce' && e.Type === 'HardBounce' ? 'hard bounce' : e.RecordType === 'SpamComplaint' ? 'spam complaint' : null;
  if (!reason) return null;
  const messageId = typeof e.MessageID === 'string' ? e.MessageID.trim() : '';
  const email = typeof e.Email === 'string' ? e.Email.trim() : '';
  return messageId && email ? { messageId, email, reason } : null;
}

/**
 * Spec D19: a hard bounce or spam complaint deactivates every contact with that address in the agency that sent the
 * message (found by `notification.provider_id`), and tells the agency once per client contact. Soft bounces, other
 * record types and messages we did not send (e.g. sign-in mail) change nothing. Idempotent: Postmark retries reuse the
 * per-contact dedupe key. No delivery config ⇒ deactivate only.
 */
export async function handlePostmarkEvent(deps: { db: Db; delivery: DeliveryConfig | null }, event: unknown, now: Date = new Date()): Promise<PostmarkOutcome> {
  const ev = parse(event);
  if (!ev) return 'ignored';
  const [sent] = await deps.db.select({ agencyId: notification.agencyId }).from(notification).where(eq(notification.providerId, ev.messageId)).limit(1);
  if (!sent) return 'ignored';
  const agencyId = sent.agencyId;
  await deps.db.transaction(async (tx) => {
    const hit = await tx
      .update(contact)
      .set({ active: false })
      .where(and(eq(contact.agencyId, agencyId), sql`lower(${contact.email}) = lower(${ev.email})`))
      .returning({ id: contact.id, clientId: contact.clientId, email: contact.email });
    const delivery = deps.delivery;
    const clientContacts = hit.filter((c): c is typeof c & { clientId: string } => c.clientId !== null);
    if (!delivery || clientContacts.length === 0) return;
    const branding = await loadBranding(tx, agencyId);
    for (const c of clientContacts) {
      const [cl] = await tx.select({ name: client.name }).from(client).where(eq(client.id, c.clientId));
      const clientName = cl?.name ?? '';
      const title = `Emails to ${c.email} are bouncing`;
      const lines = [`We stopped sending to ${c.email} (${clientName}) after a ${ev.reason}.`, "Check the address in the client's delivery settings, then turn the contact back on."];
      await notify(tx, delivery, {
        agencyId, clientId: c.clientId, kind: 'contact_bounced', audience: 'agency', subjectType: 'contact', subjectId: c.id,
        dedupe: `contact_bounced:${c.id}`, link: { t: 'notifications', id: c.id }, now,
        build: (rec, link) => ({ title, body: lines.join('\n'), email: { template: 'agency_notice', props: { branding, recipientName: rec?.name ?? null, clientName, notice: 'contact_bounced', title, lines, link, actionLabel: 'Open inbox' } } }),
      });
    }
  });
  return 'deactivated';
}
