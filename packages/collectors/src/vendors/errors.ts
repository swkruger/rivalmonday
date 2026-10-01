import type { LedgerSink, VendorCallRecord } from '@cs/core';

export class VendorError extends Error {
  constructor(readonly vendor: string, readonly code: number | null, message: string, readonly retryable: boolean, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'VendorError';
  }
}

/** The cost ledger must never change a vendor call's outcome. */
export async function safeRecordVendorCall(ledger: LedgerSink, record: VendorCallRecord): Promise<void> {
  try {
    await ledger.recordVendorCall(record);
  } catch (err) {
    console.error('[vendors] ledger write failed', err);
  }
}
