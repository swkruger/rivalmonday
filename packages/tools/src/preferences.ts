import { ToolError } from '@cs/core';
import { agency, AGENCY_KINDS, client, CLIENT_KINDS, contact, type Db, type NotificationKind, notificationPref, type QuietHours } from '@cs/db';
import { parseHhmm, PERSONAL_CHANNELS, type PersonalChannel, setNotificationPref } from '@cs/engine';
import { and, asc, eq } from 'drizzle-orm';
import { validTimezone } from './timezone';

export interface MyContactSettings {
  contactId: string;
  agencyName: string;
  clientName: string | null;
  email: string;
  timezone: string | null;
  quietHours: QuietHours | null;
  kinds: { kind: string; channels: Record<PersonalChannel, boolean> }[];
}

const kindsFor = (clientId: string | null): readonly string[] => (clientId ? CLIENT_KINDS : AGENCY_KINDS);

async function myContact(service: Db, userId: string, contactId: string) {
  const [c] = await service.select().from(contact).where(and(eq(contact.id, contactId), eq(contact.userId, userId)));
  if (!c) throw new ToolError('not_found', 'Contact not found');
  return c;
}

export async function myNotificationSettings(service: Db, userId: string): Promise<MyContactSettings[]> {
  const rows = await service
    .select({ c: contact, agencyName: agency.name, clientName: client.name })
    .from(contact)
    .innerJoin(agency, eq(agency.id, contact.agencyId))
    .leftJoin(client, eq(client.id, contact.clientId))
    .where(and(eq(contact.userId, userId), eq(contact.active, true)))
    .orderBy(asc(agency.name), asc(client.name));
  const out: MyContactSettings[] = [];
  for (const { c, agencyName, clientName } of rows) {
    const prefs = await service.select().from(notificationPref).where(eq(notificationPref.contactId, c.id));
    const on = (kind: string, channel: string) => prefs.find((p) => p.kind === kind && p.channel === channel)?.enabled ?? true;
    out.push({
      contactId: c.id, agencyName, clientName: clientName ?? null, email: c.email, timezone: c.timezone, quietHours: c.quietHours ?? null,
      kinds: kindsFor(c.clientId).map((kind) => ({ kind, channels: Object.fromEntries(PERSONAL_CHANNELS.map((ch) => [ch, on(kind, ch)])) as Record<PersonalChannel, boolean> })),
    });
  }
  return out;
}

export async function setMyNotificationPref(service: Db, userId: string, input: { contactId: string; kind: NotificationKind; channel: PersonalChannel; enabled: boolean }): Promise<void> {
  const c = await myContact(service, userId, input.contactId);
  if (!kindsFor(c.clientId).includes(input.kind)) throw new ToolError('invalid_input', `${input.kind} does not apply to this contact`);
  if (!(PERSONAL_CHANNELS as readonly string[]).includes(input.channel)) throw new ToolError('invalid_input', 'Unknown channel');
  await setNotificationPref(service, input);
}

export async function updateMyContact(service: Db, userId: string, input: { contactId: string; timezone?: string | null; quietHours?: QuietHours | null }): Promise<void> {
  await myContact(service, userId, input.contactId);
  const patch: Partial<typeof contact.$inferInsert> = {};
  if (input.timezone !== undefined) {
    const tz = input.timezone?.trim() || null; // '' → NULL (4b final review M-b)
    if (tz && !validTimezone(tz)) throw new ToolError('invalid_input', 'Unknown time zone');
    patch.timezone = tz;
  }
  if (input.quietHours !== undefined) {
    const q = input.quietHours;
    if (q && (parseHhmm(q.start) === null || parseHhmm(q.end) === null)) throw new ToolError('invalid_input', 'Quiet hours must be HH:MM');
    patch.quietHours = q;
  }
  if (Object.keys(patch).length > 0) await service.update(contact).set(patch).where(eq(contact.id, input.contactId));
}
