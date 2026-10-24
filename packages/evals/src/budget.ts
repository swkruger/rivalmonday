import type { Ai } from '@cs/ai';
import type { LedgerSink } from '@cs/core';

/** A ledger row without a cost counts as this much, so a capped run cannot under-count. */
export const NULL_COST_USD = 0.05;

export class BudgetExceededError extends Error {
  constructor(readonly spent: number, readonly cap: number) {
    super(`Eval budget reached: spent $${spent.toFixed(4)} of $${cap.toFixed(2)}; stopping before the next call.`);
    this.name = 'BudgetExceededError';
  }
}

/** In-memory ledger the live `Ai` writes to; `spent()` is the running total in USD. */
export interface SpendMeter {
  ledger: LedgerSink;
  spent(): number;
}

export function createSpendMeter(): SpendMeter {
  let total = 0;
  const add = async (r: { costUsd: number | null }) => {
    total += r.costUsd ?? NULL_COST_USD;
  };
  return { ledger: { recordLlmCall: add, recordVendorCall: add }, spent: () => total };
}

/**
 * Wraps a live `Ai`: before every call it throws BudgetExceededError once spent >= maxUsd (overshoot <= one call).
 * Cost is read from `meter`: pass the same meter's `ledger` to `createAiFromEnv` so the inner Ai reports into it.
 */
export function budgetedAi(inner: Ai, maxUsd: number, meter: SpendMeter = createSpendMeter()): Ai & { spent(): number } {
  // Calls in flight have not landed in the ledger yet; reserve the null-cost price for each so concurrent
  // calls cannot all pass the gate while spent is still 0 (overshoot stays about one call).
  let inflight = 0;
  const guarded = async <T>(call: () => Promise<T>): Promise<T> => {
    if (meter.spent() + inflight * NULL_COST_USD >= maxUsd) throw new BudgetExceededError(meter.spent(), maxUsd);
    inflight++;
    try {
      return await call();
    } finally {
      inflight--;
    }
  };
  return {
    chat: (task, input, scope) => guarded(() => inner.chat(task, input, scope)),
    chatWithTools: (task, req, scope) => guarded(() => inner.chatWithTools(task, req, scope)),
    decide: (task, state, questions, scope) => guarded(() => inner.decide(task, state, questions, scope)),
    embed: (task, texts, scope) => guarded(() => inner.embed(task, texts, scope)),
    batchAvailable: (task) => inner.batchAvailable(task),
    submitBatch: (task, requests, scope) => guarded(() => inner.submitBatch(task, requests, scope)),
    collectBatch: (task, id, scope, scopeFor) => inner.collectBatch(task, id, scope, scopeFor),
    spent: () => meter.spent(),
  };
}
