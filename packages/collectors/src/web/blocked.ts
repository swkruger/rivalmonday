const CHALLENGE = /just a moment\.\.\.|challenge-platform|cf-browser-verification|captcha|verify you are human|access denied/i;

/** Blocked pages are recorded as such and never retried with other tactics (spec §4.2). */
export function detectBlocked(httpStatus: number | null, html: string): boolean {
  if (httpStatus === 401 || httpStatus === 403 || httpStatus === 429) return true;
  return CHALLENGE.test(html.slice(0, 20_000));
}
