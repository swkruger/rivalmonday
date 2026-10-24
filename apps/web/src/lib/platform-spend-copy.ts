/** Scope names shown to platform staff (mirrors the tools' alert wording: total = all providers). */
export const SPEND_SCOPE_LABEL: Record<string, string> = { total: 'all providers', openrouter: 'OpenRouter', anthropic: 'Anthropic' };

export const spendScopeLabel = (scope: string | null | undefined): string => (scope ? (SPEND_SCOPE_LABEL[scope] ?? scope) : SPEND_SCOPE_LABEL.total!);

/** C7 (owner sign-off): platform banner while the spike guard warns. `n` = how far above the baseline, in percent. */
export const spikeWarnCopy = (scope: string | null | undefined, observedUsd?: number, baselineUsd?: number): string => {
  const label = spendScopeLabel(scope);
  if (observedUsd === undefined || !baselineUsd || baselineUsd <= 0) return `AI spend is above normal (${label}).`;
  return `AI spend is ${Math.round((observedUsd / baselineUsd - 1) * 100)}% above normal (${label}).`;
};

/** C8 (owner sign-off): platform banner while all AI calls are paused. */
export const spikePausedCopy = (scope: string | null | undefined): string =>
  `All AI calls are paused after a spend spike (${spendScopeLabel(scope)}). Queued work is waiting — reset on Health.`;
