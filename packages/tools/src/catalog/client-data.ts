import { redactContactInfo } from '@cs/collectors';

/** redactContactInfo covers email and phone; web addresses are caught here. */
const WEB_ADDRESS = /https?:\/\/|www\.|\b[a-z0-9-]+\.(?:com|net|org|io|co|us|biz|info|app|dev|ai|ca|uk)\b/i;
export const NO_CLIENT_DATA = 'Names cannot include a client’s business name, phone number, email or web address.';

/** D3 "no client data in names": contact details, web addresses, or any of the given (lower-cased, >= 3 chars) client names. */
export function hasClientData(text: string, lcClientNames: readonly string[]): boolean {
  const lc = text.toLowerCase();
  return redactContactInfo(text) !== text || WEB_ADDRESS.test(text) || lcClientNames.some((n) => n.length >= 3 && lc.includes(n));
}
