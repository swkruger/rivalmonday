import { createHmac, timingSafeEqual } from 'node:crypto';
import type { SetupLookup } from '@cs/db';
import { z } from 'zod';

// Phase 11c (revised ruling F): a public visitor's chosen place travels through the browser between the lookup and the
// submit, so `intakeLookup` signs each place it returns and `submitIntake` accepts only a place it signed, for the same
// page, within the TTL. This keeps arbitrary text out of the verify email and keeps the lookup's daily caps a real bound.

/** How long a signed lookup result stays usable (a visitor idle longer must search again). */
export const INTAKE_SIG_TTL_MS = 3_600_000;

/** `setupLookupSchema` with caps: the intake place is public input that ends up in `lead.lookup`, then `client_setup`/`client`. */
export const intakeLookupSchema = z.object({
  placeId: z.string().min(1).max(300),
  cid: z.string().max(100).nullable(),
  title: z.string().min(1).max(200),
  address: z.string().max(300).nullable(),
  city: z.string().max(120).nullable(),
  category: z.string().max(120).nullable(),
  phone: z.string().max(40).nullable(),
  domain: z.string().max(253).nullable(),
  rating: z.number().min(0).max(5).nullable(),
  votes: z.number().int().min(0).nullable(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

export const signedIntakePlaceSchema = z.object({
  place: intakeLookupSchema,
  exp: z.number().int().positive(),
  sig: z.string().regex(/^[0-9a-f]{64}$/),
});
/** One lookup result as the browser holds it: the place, its expiry (epoch ms) and an HMAC over both plus the page. */
export type SignedIntakePlace = z.infer<typeof signedIntakePlaceSchema>;

/** A key derived for this purpose only, so the shared auth secret's other HMAC uses (e.g. `hashIp`) can't be replayed here. */
const keyOf = (secret: string): Buffer => createHmac('sha256', secret).update('rm-intake-lookup-v1', 'utf8').digest();

/** Canonical form: fixed field order, so key order in the posted JSON never matters. */
function canonical(place: SetupLookup, slug: string | null, exp: number): string {
  return JSON.stringify([slug ?? '', exp, place.placeId, place.cid, place.title, place.address, place.city, place.category,
    place.phone, place.domain, place.rating, place.votes, place.lat, place.lng]);
}

const macOf = (place: SetupLookup, slug: string | null, exp: number, secret: string): string =>
  createHmac('sha256', keyOf(secret)).update(canonical(place, slug, exp), 'utf8').digest('hex');

export function signIntakePlace(place: SetupLookup, slug: string | null, secret: string, now: Date): SignedIntakePlace {
  const exp = now.getTime() + INTAKE_SIG_TTL_MS;
  return { place, exp, sig: macOf(place, slug, exp, secret) };
}

/** True when `signed` was issued for this page with this secret and has not expired. Shape is checked by the caller. */
export function verifyIntakePlace(signed: SignedIntakePlace, slug: string | null, secret: string, now: Date): boolean {
  if (signed.exp <= now.getTime()) return false;
  const want = Buffer.from(macOf(signed.place, slug, signed.exp, secret), 'hex');
  const got = Buffer.from(signed.sig, 'hex');
  return got.length === want.length && timingSafeEqual(got, want);
}
