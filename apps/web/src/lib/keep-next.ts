/**
 * 15a §2.10: a client `next` (`/c/…`) rides along to check-email and the error returns, so those pages can brand by that
 * client's agency (`authBranding`; the server re-validates the id). Other paths are left off, as before. Shared by the
 * sign-in form and check-email's resend action, so a resent link has the same error return.
 */
export const keepNext = (path: string, next: string) => (next.startsWith('/c/') ? `${path}${path.includes('?') ? '&' : '?'}next=${encodeURIComponent(next)}` : path);
