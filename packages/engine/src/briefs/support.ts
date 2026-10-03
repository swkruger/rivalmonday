import type { Ai, DecisionQuestion } from '@cs/ai';
import type { CallScope } from '@cs/core';

/** Spec §7.4 "verifier support checks": its own Jev task so it can be measured, re-routed or re-thresholded by config. */
export const VERIFIER_TASK = 'verifier_decisions';
export const SUPPORT_CHUNK = 20;
export type ClaimMode = 'fact' | 'interpretation';

const QUESTION: Record<ClaimMode, (s: string) => string> = {
  fact: (s) => `Every factual claim in this STATEMENT is directly supported by the EVIDENCE (numbers, prices, dates, names and places must match it): "${s}"`,
  interpretation: (s) =>
    `This STATEMENT presents nothing about the competitor — including their motives, plans or results — as fact unless the EVIDENCE supports it; hedged readings ("may", "possibly") and advice are fine: "${s}"`,
};

/** Returns the keys whose support answer is true and confident; anything below threshold counts as unsupported. */
export async function supportCheck(ai: Ai, scope: CallScope, evidence: string, claims: { key: string; sentence: string; mode: ClaimMode }[]): Promise<Set<string>> {
  const ok = new Set<string>();
  for (let i = 0; i < claims.length; i += SUPPORT_CHUNK) {
    const chunk = claims.slice(i, i + SUPPORT_CHUNK);
    const questions: Record<string, DecisionQuestion> = Object.fromEntries(
      chunk.map((c) => [c.key, { type: 'noul', instructions: QUESTION[c.mode](c.sentence.replace(/"/g, "'")) } satisfies DecisionQuestion]),
    );
    const res = await ai.decide(VERIFIER_TASK, { evidence }, questions, scope);
    for (const c of chunk) {
      const a = res.answers[c.key];
      if (a?.type === 'noul' && a.value === true && !res.needsReview.includes(c.key)) ok.add(c.key);
    }
  }
  return ok;
}
