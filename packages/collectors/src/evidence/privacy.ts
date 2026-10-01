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

// Keys that carry a reviewer's display name under other vendors' / future field names. Each is
// pseudonymised into `reviewer_hash` (like `profile_name`), never kept.
const REVIEWER_NAME_KEYS = new Set(['profile_name', 'author_name', 'reviewer_name', 'user_name']);

// Any other key with one of these prefixes describes the reviewer (ids, links, photos, counts of the
// reviewer's own activity) and is dropped. Review payloads only — the scrubber is never applied to
// business/ad/job payloads, where e.g. `profile_*` could be legitimate business data.
const REVIEWER_KEY_PREFIXES = ['reviewer_', 'author_', 'profile_', 'user_'];

// Reviewer-uploaded review photos (user decision 2026-10-01): any key whose name contains "image" or
// "photo" (e.g. `images`, `review_images`, `photos`, `image_url`) is dropped when it holds a URL, an
// array or an object. Plain numbers/booleans (e.g. DataForSEO's `photos_count`) are kept.
const isPhotoKey = (lowerKey: string): boolean => lowerKey.includes('image') || lowerKey.includes('photo');
const holdsPhotoData = (value: unknown): boolean =>
  Array.isArray(value) || (value !== null && typeof value === 'object') || (typeof value === 'string' && /^(https?:)?\/\//i.test(value.trim()));

// A review permalink that embeds the reviewer's Google contributor id identifies the reviewer.
const isContributorLink = (lowerKey: string, value: unknown): boolean =>
  lowerKey.endsWith('_url') && typeof value === 'string' && /contrib/i.test(value);

// Matched case-insensitively against the object key, by suffix: covers review_text/owner_answer
// plus DataForSEO's untranslated original_review_text/original_owner_answer (and any future
// *_text/*_answer field) without having to enumerate every vendor key.
const CONTACT_TEXT_SUFFIXES = ['_text', '_answer'];
const isContactTextKey = (key: string): boolean => {
  const lower = key.toLowerCase();
  return CONTACT_TEXT_SUFFIXES.some((suffix) => lower.endsWith(suffix));
};

/**
 * Deep-copies a REVIEWS payload, pseudonymising reviewer names, stripping reviewer profile
 * URLs/ids/photos, reviewer-uploaded review photos and contributor-id permalinks, and redacting
 * contact info from review/owner text, at any depth. Non-matching data (review ids, ratings,
 * timestamps, photo counts, etc.) passes through unchanged. Does not mutate `payload`.
 * Only for review payloads: its key rules would over-strip business/ad payloads.
 */
export function scrubReviewerIdentity(payload: unknown, salt: string): unknown {
  if (Array.isArray(payload)) {
    return payload.map((item) => scrubReviewerIdentity(item, salt));
  }
  if (payload !== null && typeof payload === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(payload as Record<string, unknown>)) {
      const lowerKey = key.toLowerCase();
      if (REVIEWER_NAME_KEYS.has(lowerKey)) {
        const hash = pseudonymizeReviewer(typeof value === 'string' ? value : null, salt);
        if (out.reviewer_hash == null) out.reviewer_hash = hash;
        continue;
      }
      if (lowerKey === 'reviewer_hash') {
        // Already pseudonymised (re-scrubbing a scrubbed payload) — keep it.
        if (out.reviewer_hash == null) out.reviewer_hash = value;
        continue;
      }
      if (REVIEWER_LINK_KEYS.has(lowerKey) || REVIEWER_KEY_PREFIXES.some((p) => lowerKey.startsWith(p))) {
        continue;
      }
      if ((isPhotoKey(lowerKey) && holdsPhotoData(value)) || isContributorLink(lowerKey, value)) {
        continue;
      }
      if (isContactTextKey(key) && typeof value === 'string') {
        out[key] = redactContactInfo(value);
        continue;
      }
      out[key] = scrubReviewerIdentity(value, salt);
    }
    return out;
  }
  return payload;
}
