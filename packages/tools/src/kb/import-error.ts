export const IMPORT_ERRORS = ['disabled', 'robots_disallowed', 'blocked', 'http_error', 'no_content', 'off_site', 'fetch_failed', 'not_public'] as const;
export type ImportError = (typeof IMPORT_ERRORS)[number];
