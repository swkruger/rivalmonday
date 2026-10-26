/** Who a model/vendor call is attributed to. Null agency = platform-level (e.g. shared competitor crawl). */
export interface CallScope {
  agencyId: string | null;
  clientId: string | null;
  /** The business type this spend serves (cost attribution); absent when the call is not vertical-specific. */
  verticalId?: string;
  /** Non-empty => the ledger writes N rows (one per competitor), cost split equally. Never stored. */
  competitorIds?: readonly string[];
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
  /** The competitor this (split) row is attributed to. */
  competitorId?: string | null;
}

export interface VendorCallRecord extends CallScope {
  vendor: string;
  operation: string;
  units: number;
  costUsd: number | null;
  latencyMs: number;
  ok: boolean;
  competitorId?: string | null;
}

export interface LedgerSink {
  recordLlmCall(record: LlmCallRecord): Promise<void>;
  recordVendorCall(record: VendorCallRecord): Promise<void>;
}

/** A decision kept for evaluation (spec §7.3): a shadow-sampled call, or one still below threshold after the cascade. */
export interface DecisionSampleRecord extends CallScope {
  task: string;
  reason: 'shadow' | 'review';
  /** Already redacted at the call site. */
  state: unknown;
  questions: Record<string, unknown>;
  primary: { provider: string; model?: string; answers: Record<string, unknown> } | null;
  fallback: { provider: string; model?: string; answers: Record<string, unknown> } | null;
  final: Record<string, unknown>;
  needsReview: string[];
}

export interface DecisionSampleSink {
  /** Returns the new sample's id. */
  recordDecisionSample(record: DecisionSampleRecord): Promise<string>;
}
