// @ts-nocheck -- scanner fixture, never compiled
export const GENERIC_REFUSAL = "The last search didn't finish. Try again, or skip this step.";
export const MODE = 'compact';

export const reachedCopy = (clientName: string) => `${clientName} has used this month's credits.`;

export const askQuotaText = (q: Quota): string =>
  q.quota === 0 ? `${q.used} used · Ask turned off by limit` : `${q.used} of ${q.quota}`;

export function pick(code: string | null) {
  if (!code) throw new Error('Code is required here.');
  const fallback = lookup(code) ?? 'Something went wrong. Try again.';
  return COPY[code] || 'Unknown code reported.';
}
