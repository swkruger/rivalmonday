/**
 * Plain-words copy for a failed competitor search. `get_client_setup` reports the run's error *code*
 * (`internal_error`, `stale`, `cost_cap`, ...); a raw code is never shown, and an unknown one reads generically.
 */
const COPY: Record<string, string> = {
  internal_error: 'The search ran into a problem on our side. Try again, or skip this step.',
  stale: 'The search took too long and was stopped. Try again, or skip this step.',
  cost_cap: 'The search stopped early. Try again, or skip this step.',
};

export const GENERIC_REFUSAL = "The last search didn't finish. Try again, or skip this step.";

export function refusalCopy(code: string | null | undefined): string | null {
  if (!code) return null;
  return COPY[code] ?? GENERIC_REFUSAL;
}
