import { type AuditSink, ToolRegistry } from '@cs/core';
import { hashInput } from '@cs/core/server';
import { createAuditSink } from '@cs/db';
import { billingWriteGuard } from './billing-guard';
import type { ToolDeps } from './deps';
import { allTools } from './tools/all';

export type { ToolDeps } from './deps';

/** `onDeferredAuditError`: launch-gate D2 — reports an after-response (web read) audit insert that failed. */
export function createToolRegistry(deps: ToolDeps, opts: { audit?: AuditSink; onDeferredAuditError?: (err: unknown) => void } = {}): ToolRegistry<ToolDeps> {
  return new ToolRegistry<ToolDeps>(deps, opts.audit ?? createAuditSink(deps.service), Date.now, {
    hashInput,
    writeGuard: billingWriteGuard(deps),
    ...(opts.onDeferredAuditError ? { onDeferredAuditError: opts.onDeferredAuditError } : {}),
  }).register(...allTools);
}
