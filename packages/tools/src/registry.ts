import { type AuditSink, ToolRegistry } from '@cs/core';
import { hashInput } from '@cs/core/server';
import { createAuditSink } from '@cs/db';
import { billingWriteGuard } from './billing-guard';
import type { ToolDeps } from './deps';
import { allTools } from './tools/all';

export type { ToolDeps } from './deps';

export function createToolRegistry(deps: ToolDeps, opts: { audit?: AuditSink } = {}): ToolRegistry<ToolDeps> {
  return new ToolRegistry<ToolDeps>(deps, opts.audit ?? createAuditSink(deps.service), Date.now, { hashInput, writeGuard: billingWriteGuard(deps) }).register(...allTools);
}
