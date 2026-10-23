import type { DecisionSampleSink, LedgerSink, LlmCallRecord, VendorCallRecord } from '@cs/core';
import type { Db } from './client';
import { decisionSample, llmCall, vendorCall } from './schema';

/**
 * Splits one call across competitors: N rows with cost, units and tokens divided equally in integers
 * (micro-dollars for cost); the remainder lands on row 1, so the rows always sum to the original. `competitorIds` is
 * dropped. Zero or one distinct id yields a single, unsplit row.
 */
export function splitByCompetitor<R extends LlmCallRecord | VendorCallRecord>(record: R, ids: readonly string[]): R[] {
  const { competitorIds: _drop, ...base } = record as R & { competitorIds?: readonly string[] };
  const amounts = base as { units?: number; inputTokens?: number; outputTokens?: number };
  const uniq = [...new Set(ids)];
  if (uniq.length <= 1) return [{ ...base, competitorId: uniq[0] ?? base.competitorId ?? null } as R];
  const n = uniq.length;
  const share = (v: number, i: number) => Math.floor(v / n) + (i === 0 ? v % n : 0); // integers, remainder on row 1
  const micros = base.costUsd === null ? null : Math.round(base.costUsd * 1e6);
  return uniq.map((competitorId, i) => {
    const row: Record<string, unknown> = { ...base, competitorId, costUsd: micros === null ? null : share(micros, i) / 1e6 };
    if (amounts.units !== undefined) row.units = share(amounts.units, i);
    if (amounts.inputTokens !== undefined) {
      row.inputTokens = share(amounts.inputTokens, i);
      row.outputTokens = share(amounts.outputTokens ?? 0, i);
    }
    return row as R;
  });
}

/** Use with the service-role Db: ledger writes are system writes and must not depend on tenant context. */
export function createLedgerSink(db: Db): LedgerSink {
  return {
    async recordLlmCall(record) {
      await db.insert(llmCall).values(splitByCompetitor(record, record.competitorIds ?? []));
    },
    async recordVendorCall(record) {
      await db.insert(vendorCall).values(splitByCompetitor(record, record.competitorIds ?? []));
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
