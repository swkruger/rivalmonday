import type { DecisionSampleSink, LedgerSink } from '@cs/core';
import type { Db } from './client';
import { decisionSample, llmCall, vendorCall } from './schema';

/** Use with the service-role Db: ledger writes are system writes and must not depend on tenant context. */
export function createLedgerSink(db: Db): LedgerSink {
  return {
    async recordLlmCall(record) {
      await db.insert(llmCall).values(record);
    },
    async recordVendorCall(record) {
      await db.insert(vendorCall).values(record);
    },
  };
}

/** Service-role Db: decision samples are platform data (states were redacted at the call site). */
export function createDecisionSampleSink(db: Db): DecisionSampleSink {
  return {
    async recordDecisionSample(r) {
      const [row] = await db
        .insert(decisionSample)
        .values({
          task: r.task, reason: r.reason, agencyId: r.agencyId, clientId: r.clientId, state: r.state, questions: r.questions,
          primary: r.primary, fallback: r.fallback, final: r.final, needsReview: r.needsReview,
        })
        .returning({ id: decisionSample.id });
      return row!.id;
    },
  };
}
