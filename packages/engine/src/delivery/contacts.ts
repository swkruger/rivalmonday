import { ToolError, isUuid } from '@cs/core';
import { AGENCY_KINDS, client, CLIENT_KINDS, contact, type ContactRole, type Db, type NotificationKind, notificationPref, type QuietHours, type Tx } from '@cs/db';
import { and, asc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { DEFAULT_TIMEZONE, safeTimezone } from '../briefs/schedule';
import { parseHhmm } from './time';

export type Conn = Db | Tx;
export type Audience = 'client' | 'agency';
/** Personal channels a contact can switch per kind. Slack/Teams are agency webhooks; 'sms' is reserved for after 4b. */
export const PERSONAL_CHANNELS = ['in_app', 'email'] as const;
export type PersonalChannel = (typeof PERSONAL_CHANNELS)[number];

export interface Recipient {
  contactId: string;
  name: string | null;
  email: string;
  role: ContactRole;
  timezone: string;
  quietHours: QuietHours | null;
  channels: PersonalChannel[];
}

export interface NewContact {
  agencyId: string;
  clientId?: string | null;
  role: ContactRole;
  email: string;
  name?: string | null;
  timezone?: string | null;
  quietHours?: QuietHours | null;
  clientScope?: string[] | null;
}

const AGENCY_ROLES: ContactRole[] = ['agency_admin', 'account_manager'];
const ALL_ROLES: ContactRole[] = ['agency_admin', 'account_manager', 'client_owner', 'client_viewer'];
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Active contacts that should get `kind` about this client, each with the personal channels their preferences leave on. */
export async function recipientsFor(db: Conn, input: { agencyId: string; clientId: string; kind: NotificationKind; audience: Audience }): Promise<Recipient[]> {
  if (input.audience === 'client' && !(CLIENT_KINDS as readonly string[]).includes(input.kind)) throw new Error(`${input.kind} is not a client notification kind`);
  if (input.audience === 'agency' && !(AGENCY_KINDS as readonly string[]).includes(input.kind)) throw new Error(`${input.kind} is not an agency notification kind`);
  const [c] = await db.select({ timezone: client.timezone }).from(client).where(and(eq(client.id, input.clientId), eq(client.agencyId, input.agencyId)));
  if (!c) return [];
  const rows = await db
    .select()
    .from(contact)
    .where(and(
      eq(contact.agencyId, input.agencyId), eq(contact.active, true),
      input.audience === 'client'
        ? eq(contact.clientId, input.clientId)
        : and(isNull(contact.clientId), or(isNull(contact.clientScope), sql`${contact.clientScope} ? ${input.clientId}`)),
    ))
    .orderBy(asc(contact.createdAt), asc(contact.id));
  if (rows.length === 0) return [];
  const prefs = await db.select().from(notificationPref).where(and(inArray(notificationPref.contactId, rows.map((r) => r.id)), eq(notificationPref.kind, input.kind)));
  const out: Recipient[] = [];
  for (const r of rows) {
    const channels = PERSONAL_CHANNELS.filter((ch) => prefs.find((p) => p.contactId === r.id && p.channel === ch)?.enabled ?? true);
    if (channels.length === 0) continue;
    const fallback = input.audience === 'client' ? c.timezone : DEFAULT_TIMEZONE;
    out.push({ contactId: r.id, name: r.name, email: r.email, role: r.role as ContactRole, timezone: safeTimezone(r.timezone ?? fallback), quietHours: r.quietHours ?? null, channels: [...channels] });
  }
  return out;
}

export async function addContact(db: Db, input: NewContact): Promise<string> {
  const email = input.email.trim();
  if (!EMAIL.test(email)) throw new ToolError('invalid_input', 'Invalid email address');
  if (input.timezone && safeTimezone(input.timezone) !== input.timezone) throw new ToolError('invalid_input', `Unknown time zone ${input.timezone}`);
  if (input.quietHours && (parseHhmm(input.quietHours.start) === null || parseHhmm(input.quietHours.end) === null)) throw new ToolError('invalid_input', 'quiet hours must be HH:MM');
  if (!ALL_ROLES.includes(input.role)) throw new ToolError('invalid_input', `Invalid role ${input.role}`);
  const agencyRole = AGENCY_ROLES.includes(input.role);
  if (!agencyRole && !input.clientId) throw new ToolError('invalid_input', 'a client role requires a client id');
  if (input.clientScope && (!agencyRole || !input.clientScope.every(isUuid))) throw new ToolError('invalid_input', 'client scope is only for agency staff and must list client ids');
  const [row] = await db
    .insert(contact)
    .values({
      agencyId: input.agencyId, clientId: agencyRole ? null : input.clientId ?? null, role: input.role, email, name: input.name ?? null,
      timezone: input.timezone ?? null, quietHours: input.quietHours ?? null, clientScope: input.clientScope ?? null,
    })
    .returning({ id: contact.id });
  return row!.id;
}

export async function setNotificationPref(db: Db, input: { contactId: string; kind: NotificationKind; channel: PersonalChannel; enabled: boolean }): Promise<void> {
  const [c] = await db.select({ agencyId: contact.agencyId }).from(contact).where(eq(contact.id, input.contactId));
  if (!c) throw new ToolError('not_found', 'Contact not found');
  await db
    .insert(notificationPref)
    .values({ contactId: input.contactId, agencyId: c.agencyId, kind: input.kind, channel: input.channel, enabled: input.enabled })
    .onConflictDoUpdate({ target: [notificationPref.contactId, notificationPref.kind, notificationPref.channel], set: { enabled: input.enabled } });
}

/** Spec §9.2 "reply-to AM": the first active account manager covering the client, else the first agency admin. */
export async function replyToFor(db: Conn, agencyId: string, clientId: string): Promise<{ email: string; name: string | null } | null> {
  const rows = await db
    .select({ email: contact.email, name: contact.name, role: contact.role })
    .from(contact)
    .where(and(eq(contact.agencyId, agencyId), isNull(contact.clientId), eq(contact.active, true), or(isNull(contact.clientScope), sql`${contact.clientScope} ? ${clientId}`)))
    .orderBy(asc(contact.createdAt), asc(contact.id));
  const pick = rows.find((r) => r.role === 'account_manager') ?? rows.find((r) => r.role === 'agency_admin');
  return pick ? { email: pick.email, name: pick.name } : null;
}
