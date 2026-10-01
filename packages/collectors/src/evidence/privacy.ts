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
// array, an object or null (DataForSEO sends `images: null` on photo-less reviews). Plain
// numbers/booleans (e.g. DataForSEO's `photos_count`) are kept.
const isPhotoKey = (lowerKey: string): boolean => lowerKey.includes('image') || lowerKey.includes('photo');
const holdsPhotoData = (value: unknown): boolean =>
  value === null || Array.isArray(value) || (value !== null && typeof value === 'object') || (typeof value === 'string' && /^(https?:)?\/\//i.test(value.trim()));

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

// Words in a display name that are not the person's name: titles, articles and the generic words of
// placeholder names ("A Google User", "Texas Homeowner", "The Smith Family"). Never redacted alone.
const NON_NAME_WORDS = new Set([
  'the', 'of', 'and', 'a', 'an', 'de', 'la', 'le', 'van', 'von', 'da', 'del', 'di',
  'mr', 'mrs', 'ms', 'miss', 'mx', 'dr', 'prof', 'rev', 'jr', 'sr', 'ii', 'iii', 'iv',
  'family', 'user', 'google', 'customer', 'client', 'homeowner', 'owner', 'guest', 'anonymous', 'local', 'guide',
  'team', 'home', 'house', 'my', 'our', 'mom', 'dad', 'llc', 'inc', 'co',
]);

/** Splits a name on whitespace and hyphens/dashes, trims non-letters, keeps words of 2+ letters. */
const nameWords = (s: string): string[] =>
  s.split(/[\s\u2010-\u2015-]+/u).map((w) => w.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, '')).filter((w) => w.length >= 2);

const capitalised = (w: string): string => w.charAt(0).toLocaleUpperCase('en-US') + w.slice(1).toLocaleLowerCase('en-US');

/**
 * Replaces the reviewer's own name in `text` with "[name]". Live-verified 2026-10-01: ~72% of owner
 * replies address the reviewer by first name ("Thank you, Mike!"), a few repeat the full name.
 * - the full display name is matched case-insensitively;
 * - single name words (split on whitespace and hyphens) are matched only in their Capitalised form,
 *   so "Will Hunt" does not redact "we will fix it";
 * - titles/articles/generic placeholder words ("the", "Mr", "Family", "Google User", "Homeowner") and
 *   any word of the business's own name (`businessNames`) are never redacted on their own.
 * Note: review dedupe falls back to a hash of the stored (redacted) text when review_id is missing,
 * so changing these rules changes those fallback keys.
 */
export function redactReviewerName(text: string, name: string | null | undefined, businessNames: readonly (string | null | undefined)[] = []): string {
  const full = name?.trim();
  if (!full) return text;
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const around = (term: string, flags: string) => new RegExp(`(?<![\\p{L}\\p{N}])${esc(term)}(?![\\p{L}\\p{N}])`, flags);
  const business = new Set(businessNames.flatMap((b) => (b ? nameWords(b).map((w) => w.toLowerCase()) : [])));
  let out = text;
  if (full.length >= 2) out = out.replace(around(full, 'giu'), '[name]');
  // Each word in its Capitalised form and, when it has inner capitals (live: "McKenzie"-style names),
  // as written — a lowercase or ALL-LOWER profile word ("mike") still only matches "Mike".
  const keep = nameWords(full).filter((w) => !NON_NAME_WORDS.has(w.toLowerCase()) && !business.has(w.toLowerCase()));
  const words = [...new Set(keep.flatMap((w) => (/\p{Lu}/u.test(w.slice(1)) && w !== w.toLocaleUpperCase('en-US') ? [capitalised(w), w] : [capitalised(w)])))];
  for (const w of words.sort((a, b) => b.length - a.length)) out = out.replace(around(w, 'gu'), '[name]');
  return out;
}

// On a review item (an object carrying a reviewer name or a review_id), these describe the
// *reviewer's* own activity (how many reviews/photos they have posted, Local Guide status) — a
// fingerprint of the person, not data about the review. The result-level `reviews_count` (the
// business's total) is on an object without a reviewer name/review_id and is kept.
const REVIEWER_ACTIVITY_KEYS = new Set(['reviews_count', 'photos_count', 'local_guide']);

/**
 * Deep-copies a REVIEWS payload, pseudonymising reviewer names, stripping reviewer profile
 * URLs/ids/photos, reviewer-uploaded review photos and contributor-id permalinks, and redacting
 * contact info and the reviewer's own name from review/owner text, and dropping the reviewer's
 * activity counts on review items, at any depth. Non-matching data (review ids, ratings,
 * timestamps, the business's own reviews_count, etc.) passes through unchanged. Does not mutate `payload`.
 * Only for review payloads: its key rules would over-strip business/ad payloads.
 */
export function scrubReviewerIdentity(payload: unknown, salt: string, businessNames: readonly (string | null | undefined)[] = []): unknown {
  if (Array.isArray(payload)) {
    return payload.map((item) => scrubReviewerIdentity(item, salt, businessNames));
  }
  if (payload !== null && typeof payload === 'object') {
    const out: Record<string, unknown> = {};
    const entries = Object.entries(payload as Record<string, unknown>);
    const reviewerName = entries.find(([k, v]) => REVIEWER_NAME_KEYS.has(k.toLowerCase()) && typeof v === 'string')?.[1] as string | undefined;
    const isReviewItem = reviewerName !== undefined || entries.some(([k]) => k.toLowerCase() === 'review_id' || k.toLowerCase() === 'reviewer_hash');
    // A reviews result object carries the business's own `title` next to its `items`: its words are
    // never redacted as reviewer names in the items below (e.g. reviewer "Texas Homeowner" vs the
    // business "Aire Serv of Central Texas").
    const resultTitle = !isReviewItem && Array.isArray((payload as Record<string, unknown>).items) ? (payload as Record<string, unknown>).title : undefined;
    const names = typeof resultTitle === 'string' ? [...businessNames, resultTitle] : businessNames;
    for (const [key, value] of entries) {
      const lowerKey = key.toLowerCase();
      if (isReviewItem && REVIEWER_ACTIVITY_KEYS.has(lowerKey)) continue;
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
        out[key] = redactReviewerName(redactContactInfo(value), reviewerName, names);
        continue;
      }
      out[key] = scrubReviewerIdentity(value, salt, names);
    }
    return out;
  }
  return payload;
}
