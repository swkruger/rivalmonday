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
  const gate = () => {
    if (meter.spent() >= maxUsd) throw new BudgetExceededError(meter.spent(), maxUsd);
  };
  return {
    chat: async (task, input, scope) => (gate(), inner.chat(task, input, scope)),
    chatWithTools: async (task, req, scope) => (gate(), inner.chatWithTools(task, req, scope)),
    decide: async (task, state, questions, scope) => (gate(), inner.decide(task, state, questions, scope)),
    embed: async (task, texts, scope) => (gate(), inner.embed(task, texts, scope)),
    batchAvailable: (task) => inner.batchAvailable(task),
    submitBatch: async (task, requests, scope) => (gate(), inner.submitBatch(task, requests, scope)),
    collectBatch: (task, id, scope, scopeFor) => inner.collectBatch(task, id, scope, scopeFor),
    spent: () => meter.spent(),
  };
}
