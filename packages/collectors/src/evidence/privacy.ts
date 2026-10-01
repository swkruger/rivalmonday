import { createHmac } from 'node:crypto';

export function pseudonymizeReviewer(name: string | null | undefined, salt: string): string | null {
  const n = name?.trim().toLowerCase();
  if (!n) return null;
  return createHmac('sha256', salt).update(n).digest('hex');
}

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
// Non-NANP international numbers: "+", 1-3 digit country code, then at least 7 more digits
// (grouped in 1-4 at a time) optionally separated by single spaces, dots, dashes or parens,
// e.g. "+44 20 7946 0958", "+49 (30) 123456", "+33 1 23 45 67 89". Run before PHONE so each
// number is consumed as exactly one match (PHONE would otherwise also match the NANP-shaped
// tail of some of these).
const INTL_PHONE = /\+\d{1,3}[\s.-]?\(?\d{1,4}\)?(?:[\s.-]?\d{2,4}){1,4}/g;
// North American and international formats with at least 10 digits; won't match "$79" or "2026".
const PHONE = /(?:\+?\d{1,3}[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g;

export function redactContactInfo(text: string): string {
  return text.replace(EMAIL, '[email]').replace(INTL_PHONE, '[phone]').replace(PHONE, '[phone]');
}

export function requireSalt(env: NodeJS.ProcessEnv): string {
  const salt = env.REVIEWER_HASH_SALT;
  if (!salt || salt.length < 32) throw new Error('REVIEWER_HASH_SALT must be set to at least 32 random characters');
  return salt;
}

// Keys whose value is a URL pointing at the *reviewer's* profile or photo (not a review photo).
// Matched case-insensitively against the object key.
const REVIEWER_LINK_KEYS = new Set([
  'profile_url',
  'profile_image_url',
  'reviewer_url',
  'reviewer_image_url',
  'author_url',
  'author_image_url',
  'user_url',
  'user_image_url',
]);

const CONTACT_TEXT_KEYS = new Set(['review_text', 'owner_answer']);

/**
 * Deep-copies `payload`, pseudonymising reviewer names and stripping reviewer profile
 * URLs/photos and redacting contact info from review/owner text, at any depth. Non-matching
 * data (review ids, review photos, etc.) passes through unchanged. Does not mutate `payload`.
 */
export function scrubReviewerIdentity(payload: unknown, salt: string): unknown {
  if (Array.isArray(payload)) {
    return payload.map((item) => scrubReviewerIdentity(item, salt));
  }
  if (payload !== null && typeof payload === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(payload as Record<string, unknown>)) {
      const lowerKey = key.toLowerCase();
      if (key === 'profile_name') {
        out.reviewer_hash = pseudonymizeReviewer(typeof value === 'string' ? value : null, salt);
        continue;
      }
      if (REVIEWER_LINK_KEYS.has(lowerKey)) {
        continue;
      }
      if (CONTACT_TEXT_KEYS.has(key) && typeof value === 'string') {
        out[key] = redactContactInfo(value);
        continue;
      }
      out[key] = scrubReviewerIdentity(value, salt);
    }
    return out;
  }
  return payload;
}
