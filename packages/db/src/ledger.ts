import type { LedgerSink } from '@cs/core';
import type { Db } from './client';
import { llmCall, vendorCall } from './schema';

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
