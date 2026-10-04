import { contact, type Db, notification } from '@cs/db';
import { and, count, desc, eq, inArray, isNull, type SQL } from 'drizzle-orm';

export type InboxOwner = { userId: string } | { contactId: string };
export interface InboxItem {
  id: string;
  kind: string;
  title: string;
  body: string;
  link: string | null;
  clientId: string;
  createdAt: Date;
  readAt: Date | null;
}

async function ownerContacts(service: Db, owner: InboxOwner): Promise<string[]> {
  if ('contactId' in owner) return [owner.contactId];
  const rows = await service.select({ id: contact.id }).from(contact).where(eq(contact.userId, owner.userId));
  return rows.map((r) => r.id);
}

async function scope(service: Db, owner: InboxOwner, extra?: SQL): Promise<SQL | null> {
  const ids = await ownerContacts(service, owner);
  if (ids.length === 0) return null;
  return and(inArray(notification.contactId, ids), eq(notification.channel, 'in_app'), extra) ?? null;
}

export async function listInbox(service: Db, owner: InboxOwner, opts: { limit?: number; unreadOnly?: boolean } = {}): Promise<InboxItem[]> {
  const where = await scope(service, owner, opts.unreadOnly ? isNull(notification.readAt) : undefined);
  if (!where) return [];
  const rows = await service.select().from(notification).where(where).orderBy(desc(notification.createdAt)).limit(Math.min(opts.limit ?? 50, 200));
  return rows.map((n) => ({ id: n.id, kind: n.kind, title: n.title, body: n.body, link: n.link, clientId: n.clientId, createdAt: n.createdAt, readAt: n.readAt }));
}

export async function unreadCount(service: Db, owner: InboxOwner): Promise<number> {
  const where = await scope(service, owner, isNull(notification.readAt));
  if (!where) return 0;
  const [row] = await service.select({ n: count() }).from(notification).where(where);
  return row?.n ?? 0;
}

export async function markRead(service: Db, owner: InboxOwner, notificationId: string, now = new Date()): Promise<void> {
  const where = await scope(service, owner, and(eq(notification.id, notificationId), isNull(notification.readAt)));
  if (where) await service.update(notification).set({ readAt: now }).where(where);
}

export async function markAllRead(service: Db, owner: InboxOwner, now = new Date()): Promise<number> {
  const where = await scope(service, owner, isNull(notification.readAt));
  if (!where) return 0;
  const rows = await service.update(notification).set({ readAt: now }).where(where).returning({ id: notification.id });
  return rows.length;
}
