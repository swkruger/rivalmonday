import { hashInput } from '@cs/core/server';
import { type Db, platformAuditLog, type Tx } from '@cs/db';
import { type SQL, sql } from 'drizzle-orm';
import { MIN_PURGE_DAYS } from './cli/purge-args';

/**
 * Spec D16/D17 (7a2): operator-only archive and purge of agencies/clients. Archived rows read as deleted everywhere
 * (Task 9 filters); purge deletes them for good after the grace period. Ledger/audit rows survive detached (their FKs were
 * dropped in 0082) with the people anonymised; Better Auth users are left alone (Decision 7). Evidence, captures and
 * objects belong to competitors, not tenants, and are never touched.
 */

type Exec = Pick<Db | Tx, 'execute'>;
type Kind = 'agency' | 'client';

export type ArchiveResult = { ok: true } | { error: 'not_found' | 'billing_active'; message: string };

const CLI_USER = 'cli';
const rows = async <T extends Record<string, unknown>>(db: Exec, q: SQL): Promise<T[]> => [...(await db.execute<T>(q))] as T[];
const ts = (d: Date) => sql`${d.toISOString()}::timestamptz`;

/**
 * Controller ruling: archiving hides the tenant from the billing tools and the daily billing job, so a live Stripe
 * subscription would keep charging out of sight. Refused (no override) while the agency has a subscription in any state
 * but `pilot`/`cancelled`, or the agency/client has enabled client billing that is `active`/`payment_needed`.
 */
function liveBillingQuery(kind: Kind, id: string): SQL {
  const clientBilling = (clientIds: SQL) => sql`EXISTS (
    SELECT 1 FROM client_billing cb WHERE cb.client_id IN (${clientIds}) AND cb.enabled AND cb.state IN ('active', 'payment_needed'))`;
  if (kind === 'client') return sql`SELECT ${clientBilling(sql`${id}::uuid`)} AS live`;
  return sql`SELECT (
    EXISTS (SELECT 1 FROM agency_billing ab WHERE ab.agency_id = ${id} AND ab.stripe_subscription_id IS NOT NULL
            AND ab.state NOT IN ('pilot', 'cancelled'))
    OR ${clientBilling(sql`SELECT c.id FROM client c WHERE c.agency_id = ${id}`)}) AS live`;
}

/** Sets (keeping an earlier timestamp, so the purge clock never restarts) or clears `archived_at`; one platform audit row. */
export async function archiveTenant(db: Db, args: { kind: Kind; id: string; undo: boolean }, now: Date = new Date()): Promise<ArchiveResult> {
  const started = Date.now();
  const table = args.kind === 'agency' ? sql`agency` : sql`client`;
  return db.transaction(async (tx) => {
    const [row] = await rows<{ id: string }>(tx, sql`SELECT id FROM ${table} WHERE id = ${args.id} FOR UPDATE`);
    if (!row) return { error: 'not_found', message: `No ${args.kind} with id ${args.id}.` };
    if (!args.undo) {
      const [check] = await rows<{ live: boolean }>(tx, liveBillingQuery(args.kind, args.id));
      if (check?.live) {
        return {
          error: 'billing_active',
          message:
            `Refused: ${args.kind} ${args.id} has a live Stripe subscription. Cancel the subscription in Stripe first, then archive ` +
            '(archived rows are hidden from billing, so it would keep charging unseen).',
        };
      }
    }
    const value = args.undo ? sql`NULL` : sql`coalesce(archived_at, ${ts(now)})`;
    await tx.execute(sql`UPDATE ${table} SET archived_at = ${value} WHERE id = ${args.id}`);
    await tx.insert(platformAuditLog).values({
      userId: CLI_USER, tool: `${args.undo ? 'unarchive' : 'archive'}_${args.kind}`, inputHash: hashInput(args),
      outcome: 'ok', durationMs: Math.max(0, Date.now() - started),
    });
    return { ok: true } as const;
  });
}

/** Agency purge: every audit row of the agency. (`user_id <> 'purged'` only keeps the count honest; the update is a no-op otherwise.) */
const agencyAuditWhere = (agencyId: string) => sql`agency_id = ${agencyId} AND user_id <> 'purged'`;

/** Client purge (binding SQL): users whose only membership was this client, and the client's guest contacts. */
const clientAuditWhere = (agencyId: string, clientId: string) => sql`agency_id = ${agencyId} AND user_id <> 'purged' AND (
  user_id IN (SELECT m.user_id FROM membership m WHERE m.client_id = ${clientId}
              AND NOT EXISTS (SELECT 1 FROM membership m2 WHERE m2.user_id = m.user_id AND m2.client_id IS DISTINCT FROM ${clientId}))
  OR user_id IN (SELECT 'contact:' || id FROM contact WHERE client_id = ${clientId}))`;

async function anonymise(db: Exec, where: SQL, dryRun: boolean): Promise<number> {
  const q = dryRun
    ? sql`SELECT count(*)::int AS n FROM audit_log WHERE ${where}`
    : sql`WITH u AS (UPDATE audit_log SET user_id = 'purged' WHERE ${where} RETURNING 1) SELECT count(*)::int AS n FROM u`;
  const [r] = await rows<{ n: number }>(db, q);
  return Number(r?.n ?? 0);
}

export interface PurgeCounts {
  agencies: number;
  clients: number;
  auditAnonymised: number;
}

/**
 * Deletes agencies archived before `now − olderThanDays`, then archived clients of non-archived agencies, each in its own
 * transaction (existing cascades remove the tenant's rows). Each row is re-locked and re-checked inside its transaction so
 * an `--undo` racing the purge wins. `dryRun` counts only and writes nothing (not even the audit row).
 */
export async function purgeArchived(db: Db, o: { olderThanDays: number; dryRun: boolean; now?: Date }): Promise<PurgeCounts> {
  if (!Number.isInteger(o.olderThanDays) || o.olderThanDays < MIN_PURGE_DAYS) {
    throw new Error(`refusing to purge: --older-than must be at least ${MIN_PURGE_DAYS} days (got ${o.olderThanDays})`);
  }
  const started = Date.now();
  const cutoff = ts(new Date((o.now ?? new Date()).getTime() - o.olderThanDays * 86_400_000));
  const counts: PurgeCounts = { agencies: 0, clients: 0, auditAnonymised: 0 };
  let outcome = 'internal';
  try {
    const agencies = await rows<{ id: string }>(db, sql`SELECT id FROM agency WHERE archived_at < ${cutoff} ORDER BY archived_at, id`);
    for (const { id } of agencies) {
      if (o.dryRun) {
        counts.agencies += 1;
        counts.auditAnonymised += await anonymise(db, agencyAuditWhere(id), true);
        continue;
      }
      const n = await db.transaction(async (tx) => {
        const [locked] = await rows(tx, sql`SELECT id FROM agency WHERE id = ${id} AND archived_at < ${cutoff} FOR UPDATE`);
        if (!locked) return null;
        const anonymised = await anonymise(tx, agencyAuditWhere(id), false);
        await tx.execute(sql`DELETE FROM agency WHERE id = ${id} AND archived_at < ${cutoff}`);
        return anonymised;
      });
      if (n === null) continue;
      counts.agencies += 1;
      counts.auditAnonymised += n;
    }

    const clientDue = sql`archived_at < ${cutoff} AND agency_id IN (SELECT a.id FROM agency a WHERE a.archived_at IS NULL)`;
    const clients = await rows<{ id: string; agency_id: string }>(db, sql`SELECT id, agency_id FROM client WHERE ${clientDue} ORDER BY archived_at, id`);
    for (const c of clients) {
      if (o.dryRun) {
        counts.clients += 1;
        counts.auditAnonymised += await anonymise(db, clientAuditWhere(c.agency_id, c.id), true);
        continue;
      }
      const n = await db.transaction(async (tx) => {
        const [locked] = await rows(tx, sql`SELECT id FROM client WHERE id = ${c.id} AND ${clientDue} FOR UPDATE`);
        if (!locked) return null;
        const anonymised = await anonymise(tx, clientAuditWhere(c.agency_id, c.id), false);
        await tx.execute(sql`DELETE FROM client WHERE id = ${c.id}`);
        return anonymised;
      });
      if (n === null) continue;
      counts.clients += 1;
      counts.auditAnonymised += n;
    }
    outcome = 'ok';
    return counts;
  } finally {
    if (!o.dryRun) {
      // Logged, never thrown: a failing audit insert must not mask the purge's own error (or its result).
      try {
        await db.insert(platformAuditLog).values({
          userId: CLI_USER, tool: 'purge_archived', inputHash: hashInput({ olderThanDays: o.olderThanDays }),
          outcome, durationMs: Math.max(0, Date.now() - started),
        });
      } catch (err) {
        console.error('[purge] platform audit insert failed', err instanceof Error ? err.message : err);
      }
    }
  }
}
