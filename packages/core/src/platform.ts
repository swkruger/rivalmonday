/** Phase 15c3a: the platform support address (hold copy, worker Reply-To). */
export const DEFAULT_SUPPORT_EMAIL = 'support@rivalmonday.app';

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** 5b-2 decision 2: PLATFORM_ADMIN_EMAILS "A@b.co, c@d.co" → ['a@b.co', 'c@d.co']; drops blanks, malformed entries and duplicates. */
export function normalizeAdminEmails(raw: string | undefined): string[] {
  return [...new Set((raw ?? '').split(',').map((s) => s.trim().toLowerCase()).filter((e) => EMAIL.test(e)))];
}
