import { redactContactInfo } from '@cs/collectors';

/** redactContactInfo covers email and phone; web addresses are caught here. */
const WEB_ADDRESS = /https?:\/\/|www\.|\b[a-z0-9-]+\.(?:com|net|org|io|co|us|biz|info|app|dev|ai|ca|uk)\b/i;
export const NO_CLIENT_DATA = 'Names cannot include a client’s business name, phone number, email or web address.';

const norm = (t: string): string => t.normalize('NFKC').toLowerCase();
const escapeRe = (t: string): string => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** True when `name` occurs in `text` as whole words (both already normalised): a client "Ace" does not block "Furnace repair". */
function mentions(text: string, name: string): boolean {
  return new RegExp('(?<![\\p{L}\\p{N}])' + escapeRe(name) + '(?![\\p{L}\\p{N}])', 'u').test(text);
}

/** D3 "no client data in names": contact details, web addresses, or any of the given client names (>= 3 chars, case-insensitive whole-word match). */
export function hasClientData(text: string, clientNames: readonly string[]): boolean {
  const lc = norm(text);
  return redactContactInfo(text) !== text || WEB_ADDRESS.test(text) || clientNames.some((n) => { const m = norm(n).trim(); return m.length >= 3 && mentions(lc, m); });
}
