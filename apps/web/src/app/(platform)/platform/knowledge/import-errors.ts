/** Decided copy per `ImportError` (6c Task 11). `disabled` has none: the panel is hidden when import is off. */
export const IMPORT_ERROR_COPY: Record<string, string> = {
  robots_disallowed: "The site's robots.txt doesn't allow us to read this page.",
  blocked: 'The site blocked our request.',
  http_error: 'The page returned an error.',
  no_content: "We couldn't find readable text on this page.",
  off_site: 'The page redirected to another site.',
  fetch_failed: "We couldn't load the page. Try again later.",
};

export const importErrorCopy = (e: string | undefined): string => (e && IMPORT_ERROR_COPY[e]) || IMPORT_ERROR_COPY.fetch_failed!;

export type ImportStatus = { state: 'queued' | 'running' | 'done' | 'failed'; articleId?: string; error?: string };
export type StartImportResult = { ok: true; key: string } | { ok: false; error: string };
export type ImportStatusResult = { ok: true; status: ImportStatus } | { ok: false; error: string };
