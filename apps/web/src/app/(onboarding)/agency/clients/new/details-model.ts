import { formatPhone } from '@/components/place-summary';

/** Step 1 of "Add a client" (16 §6), held in the browser until step 2 creates the client (P4). */
export interface ClientDraft {
  name: string;
  contactName: string;
  phone: string;
  email: string;
  line1: string;
  city: string;
  region: string;
  postalCode: string;
  logo: File | null;
}

export const EMPTY_DRAFT: ClientDraft = { name: '', contactName: '', phone: '', email: '', line1: '', city: '', region: '', postalCode: '', logo: null };

export const LOGO_MAX_BYTES = 512 * 1024;
export const LOGO_TOO_LARGE = 'Logo must be 512 KB or smaller.';

/** Same rules as `create_client`'s details (`PHONE` in tools/agency-onboarding.ts): the tool re-checks, this saves a round trip. */
const PHONE = /^\+?1?[\s.-]?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}$/;
const ZIP = /^\d{5}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type DraftErrors = Partial<Record<Exclude<keyof ClientDraft, 'logo'>, string>>;

/** Required: business name, contact, phone, email. The address is optional but all-or-nothing (street, city, state, ZIP). */
export function draftErrors(d: ClientDraft): DraftErrors {
  const e: DraftErrors = {};
  if (!d.name.trim()) e.name = 'Enter the business name.';
  if (!d.contactName.trim()) e.contactName = 'Enter the contact’s full name.';
  if (!d.phone.trim()) e.phone = 'Enter a phone number.';
  else if (!PHONE.test(d.phone.trim())) e.phone = 'Enter a US phone number, like (404) 555-0100';
  if (!d.email.trim()) e.email = 'Enter an email address.';
  else if (!EMAIL.test(d.email.trim())) e.email = 'Enter a valid email address';
  const address = [d.line1, d.city, d.region, d.postalCode];
  if (address.some((v) => v.trim())) {
    if (!d.line1.trim()) e.line1 = 'Add the street address, or clear the address.';
    if (!d.city.trim()) e.city = 'Add the city.';
    if (!d.region.trim()) e.region = 'Add the state.';
    if (!ZIP.test(d.postalCode.trim())) e.postalCode = 'Enter a 5-digit ZIP code';
  }
  return e;
}

/** "1801 Sam Bass Rd, Round Rock, TX 78681" (an optional ", USA" is ignored); anything else is not split. */
export function parseUsAddress(address: string | null): { line1: string; city: string; region: string; postalCode: string } | null {
  const m = /^(.+),\s*([^,]+),\s*([A-Z]{2})\s+(\d{5})(?:-\d{4})?(?:,\s*(?:USA|United States))?$/.exec((address ?? '').trim());
  return m ? { line1: m[1]!.trim(), city: m[2]!.trim(), region: m[3]!, postalCode: m[4]! } : null;
}

/** Picking a listing fills only the details that are still blank: the phone and the address fields (spec §6, step 2). */
export function fillBlanks(d: ClientDraft, place: { phone: string | null; address: string | null }): ClientDraft {
  const next = { ...d };
  if (!next.phone.trim() && place.phone) {
    const phone = formatPhone(place.phone);
    if (PHONE.test(phone)) next.phone = phone;
  }
  const a = parseUsAddress(place.address);
  if (a) for (const k of ['line1', 'city', 'region', 'postalCode'] as const) if (!next[k].trim()) next[k] = a[k];
  return next;
}

/** The "City or ZIP" box starts from the address when there is one (a city and state, else the ZIP). */
export function locationOf(d: ClientDraft): string {
  if (d.city.trim()) return [d.city.trim(), d.region.trim()].filter(Boolean).join(', ');
  return d.postalCode.trim();
}
