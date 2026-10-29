import { z } from 'zod';

// Skip zod's `new Function` probe: the CSP has no unsafe-eval, so the probe would be reported as a violation.
z.config({ jitless: true });

// Pure helpers for the join popup. Only zod is imported: packages/tools' site-contract test imports this file by relative path.

export const CLIENT_BANDS = [
  { value: '1-5', label: '1–5' },
  { value: '6-15', label: '6–15' },
  { value: '16-50', label: '16–50' },
  { value: '50+', label: '50+' },
] as const;

export type AgencyForm = {
  contactName: string;
  email: string;
  orgName: string;
  website: string;
  clientCountBand: '' | (typeof CLIENT_BANDS)[number]['value'];
  wantsSample: boolean;
  sampleBusinessName: string;
  sampleWebsite: string;
  sampleLocation: string;
};
export type BusinessForm = {
  contactName: string;
  email: string;
  orgName: string;
  website: string;
  location: string;
  /** Catalogue id, 'other' or '' (not chosen). */
  vertical: string;
  verticalOther: string;
};
export type FieldErrors = Partial<Record<string, string>>;

/** Hand mirror of @cs/tools waitlist/public.ts (boundary); site-contract.test.ts asserts identical source/flags + parity fixtures. */
export const LINKISH = /:\/\/|www\.|[a-z0-9-]+\.[a-z]{2,}(\/|\b)/i;
/** = the server's `.max()` per field. */
export const FIELD_MAX = { contactName: 120, orgName: 120, location: 120, sampleBusinessName: 120, website: 253, email: 254, verticalOther: 80 } as const;

export const ERRORS = {
  name: 'Enter your name.',
  email: 'Enter a valid email address.',
  agencyName: 'Enter the agency name.',
  businessName: 'Enter the business name.',
  band: 'Pick how many local-business clients you have.',
  websiteOrLocation: 'Add a website or a city / ZIP.',
  vertical: 'Pick a type of business, or choose Other.',
  verticalOther: 'Describe your business.',
  linkish: 'Please leave web addresses out of this field.',
  tooLong: (n: number) => `Keep this under ${n} characters.`,
} as const;

const emailSchema = z.string().trim().max(FIELD_MAX.email).email();
const BAND_VALUES: readonly string[] = CLIENT_BANDS.map((b) => b.value);

function checkName(errors: FieldErrors, key: string, raw: string, max: number, missing: string, plain: boolean) {
  const v = raw.trim();
  if (!v) errors[key] = missing;
  else if (v.length > max) errors[key] = ERRORS.tooLong(max);
  else if (plain && LINKISH.test(v)) errors[key] = ERRORS.linkish;
}
function checkOptional(errors: FieldErrors, key: string, raw: string, max: number) {
  if (raw.trim().length > max) errors[key] = ERRORS.tooLong(max);
}
function checkEmail(errors: FieldErrors, raw: string) {
  if (!emailSchema.safeParse(raw).success) errors.email = ERRORS.email;
}

export function validateAgency(f: AgencyForm): FieldErrors {
  const e: FieldErrors = {};
  checkName(e, 'contactName', f.contactName, FIELD_MAX.contactName, ERRORS.name, true);
  checkEmail(e, f.email);
  checkName(e, 'orgName', f.orgName, FIELD_MAX.orgName, ERRORS.agencyName, false);
  checkOptional(e, 'website', f.website, FIELD_MAX.website);
  if (!BAND_VALUES.includes(f.clientCountBand)) e.clientCountBand = ERRORS.band;
  if (f.wantsSample) {
    checkName(e, 'sampleBusinessName', f.sampleBusinessName, FIELD_MAX.sampleBusinessName, ERRORS.businessName, true);
    checkOptional(e, 'sampleWebsite', f.sampleWebsite, FIELD_MAX.website);
    checkOptional(e, 'sampleLocation', f.sampleLocation, FIELD_MAX.location);
    if (!f.sampleWebsite.trim() && !f.sampleLocation.trim()) e.sampleWebsite = ERRORS.websiteOrLocation;
  }
  return e;
}

export function validateBusiness(f: BusinessForm): FieldErrors {
  const e: FieldErrors = {};
  checkName(e, 'contactName', f.contactName, FIELD_MAX.contactName, ERRORS.name, true);
  checkEmail(e, f.email);
  checkName(e, 'orgName', f.orgName, FIELD_MAX.orgName, ERRORS.businessName, false);
  checkOptional(e, 'website', f.website, FIELD_MAX.website);
  checkOptional(e, 'location', f.location, FIELD_MAX.location);
  if (!f.website.trim() && !f.location.trim()) e.website = ERRORS.websiteOrLocation;
  if (!f.vertical) e.vertical = ERRORS.vertical;
  else if (f.vertical === 'other') {
    const v = f.verticalOther.trim();
    if (!v) e.verticalOther = ERRORS.verticalOther;
    else if (v.length > FIELD_MAX.verticalOther) e.verticalOther = ERRORS.tooLong(FIELD_MAX.verticalOther);
  }
  return e;
}

/** Only meaningful values: trimmed, empty optionals left out (the server's `opt` turns a missing key into null). */
function put(target: Record<string, unknown>, key: string, raw: string | null | undefined) {
  const v = raw?.trim();
  if (v) target[key] = v;
}

export function buildWaitlistBody(
  f: { kind: 'agency'; form: AgencyForm } | { kind: 'business'; form: BusinessForm },
  turnstileToken: string,
  source: string | null,
): Record<string, unknown> {
  const body: Record<string, unknown> = { kind: f.kind };
  const form = f.form;
  body.contactName = form.contactName.trim();
  body.email = form.email.trim();
  body.orgName = form.orgName.trim();
  put(body, 'website', form.website);
  if (f.kind === 'agency') {
    body.clientCountBand = f.form.clientCountBand;
    if (f.form.wantsSample) {
      const sample: Record<string, unknown> = { businessName: f.form.sampleBusinessName.trim() };
      put(sample, 'website', f.form.sampleWebsite);
      put(sample, 'location', f.form.sampleLocation);
      body.sample = sample;
    }
  } else {
    put(body, 'location', f.form.location);
    if (f.form.vertical === 'other') put(body, 'verticalOther', f.form.verticalOther);
    else put(body, 'verticalId', f.form.vertical);
  }
  put(body, 'source', source);
  body.turnstileToken = turnstileToken;
  return body;
}

/** Where the visitor came from, ≤ 200 chars: `utm_source`, else the referrer's host, else the landing path. */
export function sourceFrom(loc: { search: string; pathname: string }, referrer: string): string | null {
  const utm = new URLSearchParams(loc.search).get('utm_source')?.trim();
  let value = utm || '';
  if (!value && referrer) {
    try {
      value = new URL(referrer).host;
    } catch {
      value = '';
    }
  }
  if (!value) value = loc.pathname;
  value = value.slice(0, 200);
  return value || null;
}
