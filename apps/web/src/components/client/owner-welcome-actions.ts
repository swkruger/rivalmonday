'use server';
import { cookies } from 'next/headers';
import { welcomeCookieName } from './owner-welcome-cookie';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The "Dismiss" button on the owner's welcome line: remembers it for a year, for this browser. Nothing is read or written in the database. */
export async function dismissWelcome(clientId: string): Promise<void> {
  if (!UUID.test(clientId)) return; // the id becomes part of a cookie name
  (await cookies()).set(welcomeCookieName(clientId), '1', { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 60 * 60 * 24 * 365 });
}
