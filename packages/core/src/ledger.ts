/** Who a model/vendor call is attributed to. Null agency = platform-level (e.g. shared competitor crawl). */
export interface CallScope {
  agencyId: string | null;
  clientId: string | null;
}

export interface LlmCallRecord extends CallScope {
  task: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number | null;
  latencyMs: number;
  ok: boolean;
}

export interface VendorCallRecord extends CallScope {
  vendor: string;
  operation: string;
  units: number;
  costUsd: number | null;
  latencyMs: number;
  ok: boolean;
}

export interface LedgerSink {
  recordLlmCall(record: LlmCallRecord): Promise<void>;
  recordVendorCall(record: VendorCallRecord): Promise<void>;
}
