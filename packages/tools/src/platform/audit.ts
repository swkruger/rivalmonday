import { type AccessContext, ToolError } from '@cs/core';
import { hashInput } from '@cs/core/server';
import { auditLog, type Db, platformAuditLog } from '@cs/db';
import type { ToolDeps } from '../deps';
import type { PlatformRole } from '../platform';

type AuditDeps = Pick<ToolDeps, 'service'>;

export interface PlatformAuditEntry {
  tool: string;
  input: unknown;
  outcome: string;
  durationMs: number;
  /** Set: the row goes to that agency's `audit_log` (so the agency sees the platform view); else `platform_audit_log`. */
  agencyId?: string;
  role: PlatformRole;
  /** 8b M4: the support session the call opened (agency `audit_log` rows only), e.g. `start_support_session`. */
  supportSessionId?: string;
}

/** What a tool body may add to its own audit row once it knows it (set before returning or throwing). */
export interface PlatformAuditNote {
  supportSessionId?: string;
  /** 7a2: the target agency when only the body learns it (`end_support_session`: the ended session's agency). */
  agencyId?: string;
}

/**
 * Spec d8. Inserts directly on the service role (not `createAuditSink`: `AuditEvent.role`/`outcome` are typed for agency
 * roles; `audit_log.role` is plain text, here `platform_<role>`). Input hash = the registry's `hashInput`.
 */
export async function recordPlatformAudit(deps: AuditDeps, ctx: AccessContext, a: PlatformAuditEntry): Promise<void> {
  const inputHash = hashInput(a.input);
  const durationMs = Math.max(0, Math.round(a.durationMs));
  if (a.agencyId) {
    await deps.service.insert(auditLog).values({
      agencyId: a.agencyId, userId: ctx.userId, role: `platform_${a.role}`, tool: a.tool, inputHash,
      outcome: a.outcome, rowCount: null, durationMs, channel: 'web', tokenId: null, supportSessionId: a.supportSessionId ?? null,
    });
    return;
  }
  await deps.service.insert(platformAuditLog).values({ userId: ctx.userId, tool: a.tool, inputHash, outcome: a.outcome, durationMs });
}

/**
 * Runs a platform tool body and writes exactly one audit row in `finally` (outcome `ok`, the ToolError code, or `internal`).
 * Call it after `requirePlatformOperator`, so refusals never reach the platform log. An audit write failure fails the call
 * (as the registry does); the original error is logged first.
 */
export async function withPlatformAudit<T>(
  deps: AuditDeps,
  ctx: AccessContext,
  a: Omit<PlatformAuditEntry, 'outcome' | 'durationMs'>,
  fn: (note: PlatformAuditNote) => Promise<T>,
): Promise<T> {
  const started = Date.now();
  const note: PlatformAuditNote = {};
  let outcome = 'internal';
  let failure: unknown;
  try {
    const result = await fn(note);
    outcome = 'ok';
    return result;
  } catch (err) {
    failure = err;
    if (err instanceof ToolError) outcome = err.code;
    throw err;
  } finally {
    try {
      await recordPlatformAudit(deps, ctx, { ...a, ...note, outcome, durationMs: Date.now() - started });
    } catch (err) {
      // eslint-disable-next-line no-console -- the original tool error must not be lost behind the audit failure
      if (failure !== undefined) console.error('[platform] tool error before audit failure', failure);
      // eslint-disable-next-line no-console -- audit failures must be visible even though we fail closed
      console.error('[platform] audit write failed', err);
      // eslint-disable-next-line no-unsafe-finally -- fail closed: an unaudited platform read must not succeed
      throw new ToolError('internal', 'Audit logging failed', { cause: err });
    }
  }
}

/** What a support session opened outside the tool registry: `/go/<target>/<id>` and the `/files/*` routes. */
export type SupportAccessSurface = 'go' | 'evidence' | 'pdf' | 'rank_map';

/**
 * 7a2 §4: a support session's direct reads (link redirects and file downloads, which the registry never sees as their
 * own call) leave one row in the target agency's `audit_log`, like a tool call inside the session. No-op without
 * `ctx.support`. Callers invoke it only once access succeeded (a refusal is already audited by the access tool).
 */
export async function recordSupportAccess(service: Db, ctx: AccessContext, a: { surface: SupportAccessSurface; subjectId: string }): Promise<void> {
  if (!ctx.support) return;
  await service.insert(auditLog).values({
    agencyId: ctx.agencyId, userId: ctx.support.platformUserId, role: 'platform_support', tool: `support_view_${a.surface}`,
    inputHash: hashInput({ surface: a.surface, subjectId: a.subjectId }), outcome: 'ok', rowCount: null, durationMs: 0, channel: 'web',
    tokenId: null, supportSessionId: ctx.support.sessionId,
  });
}
