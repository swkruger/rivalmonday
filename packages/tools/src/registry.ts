import { type AuditSink, ToolRegistry } from '@cs/core';
import { createAuditSink, type Db } from '@cs/db';
import { alertTools } from './tools/alerts';
import { briefTools } from './tools/briefs';
import { clientTools } from './tools/clients';
import { reportTools } from './tools/reports';

export interface ToolDeps {
  /** app_user connection: tenant reads go through withTenant + RLS. */
  app: Db;
  /** Service role: audit, and engine functions that need it. */
  service: Db;
}

export function createToolRegistry(deps: ToolDeps, opts: { audit?: AuditSink } = {}): ToolRegistry<ToolDeps> {
  return new ToolRegistry<ToolDeps>(deps, opts.audit ?? createAuditSink(deps.service)).register(...clientTools, ...briefTools, ...alertTools, ...reportTools);
}
