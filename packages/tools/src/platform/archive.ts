import { hashInput } from '@cs/core/server';
import { type Db, platformAuditLog, type Tx } from '@cs/db';
import { type SQL, sql } from 'drizzle-orm';

/**
 * Spec D16/D17 (7a2): operator-only archive of agencies/clients, shared by the worker CLI (`archive`) and the platform
 * console tools. Archived rows read as deleted everywhere; the purge (worker) deletes them after the grace period.
 */

type Kind = 'agency' | 'client';

export type ArchiveResult = { ok: true } | { error: 'not_found' | 'billing_active'; message: string };

const CLI_USER = 'cli';
const rows = async <T extends Record<string, unknown>>(db: Pick<Db | Tx, 'execute'>, q: SQL): Promise<T[]> => [...(await db.execute<T>(q))] as T[];
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

/** The two live-billing conditions of `liveBillingQuery`, split: the agency's own plan and its clients' client-billing subscriptions. */
export async function liveBilling(db: Db | Tx, agencyId: string): Promise<{ agencyPlan: boolean; clientSubscriptions: number }> {
  const [r] = await rows<{ plan: boolean; subs: number }>(db, sql`SELECT
    EXISTS (SELECT 1 FROM agency_billing ab WHERE ab.agency_id = ${agencyId} AND ab.stripe_subscription_id IS NOT NULL
            AND ab.state NOT IN ('pilot', 'cancelled')) AS plan,
    (SELECT count(*)::int FROM client_billing cb WHERE cb.client_id IN (SELECT c.id FROM client c WHERE c.agency_id = ${agencyId})
            AND cb.enabled AND cb.state IN ('active', 'payment_needed')) AS subs`);
  return { agencyPlan: Boolean(r?.plan), clientSubscriptions: Number(r?.subs ?? 0) };
}

/**
 * Sets (keeping an earlier timestamp, so the purge clock never restarts) or clears `archived_at`; one platform audit row
 * (`audit: 'cli'`, the default; `'none'` for callers that audit themselves).
 */
export async function archiveTenant(
  db: Db,
  args: { kind: Kind; id: string; undo: boolean },
  o: { now?: Date; audit?: 'cli' | 'none' } = {},
): Promise<ArchiveResult> {
  const now = o.now ?? new Date();
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
    if ((o.audit ?? 'cli') === 'cli') {
      await tx.insert(platformAuditLog).values({
        userId: CLI_USER, tool: `${args.undo ? 'unarchive' : 'archive'}_${args.kind}`, inputHash: hashInput(args),
        outcome: 'ok', durationMs: Math.max(0, Date.now() - started),
      });
    }
    return { ok: true } as const;
  });
}
