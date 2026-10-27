import { clientSetup, contact, type Tx } from '@cs/db';
import { and, desc, eq } from 'drizzle-orm';

type Db = Pick<Tx, 'select'>;

/**
 * THE owner contact of a client (every reader uses this): the most recently set `client_owner` contact. `contact` has
 * no updated_at, so a contact set again via `update_client_details` has its `created_at` bumped; older rows are kept
 * (they may still receive reports). Service connection (`contact` is service-role only).
 */
export async function ownerContact(db: Db, agencyId: string, clientId: string): Promise<{ id: string; name: string | null; email: string } | null> {
  const [latest] = await db.select({ id: contact.id, name: contact.name, email: contact.email }).from(contact)
    .where(and(eq(contact.agencyId, agencyId), eq(contact.clientId, clientId), eq(contact.role, 'client_owner'))).orderBy(desc(contact.createdAt), desc(contact.id)).limit(1);
  return latest ?? null;
}

/** First word of a display name; null for an empty or missing name. */
export function firstNameOf(name: string | null | undefined): string | null {
  const first = name?.trim().split(/\s+/)[0];
  return first ? first : null;
}

/**
 * O12 "Waiting on <first name>": the person who will pick — the setup's invited contact (the review-email target) once
 * someone was invited, else the details owner contact. Display only; never an email or a send target. Service connection.
 */
export async function pickingOwnerFirstName(db: Db, agencyId: string, clientId: string): Promise<string | null> {
  const [invited] = await db.select({ name: contact.name }).from(clientSetup)
    .innerJoin(contact, eq(contact.id, clientSetup.invitedContactId))
    .where(and(eq(clientSetup.clientId, clientId), eq(contact.agencyId, agencyId), eq(contact.clientId, clientId)));
  if (invited) return firstNameOf(invited.name);
  return firstNameOf((await ownerContact(db, agencyId, clientId))?.name);
}
