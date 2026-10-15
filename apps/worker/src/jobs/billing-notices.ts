import { noticeEmailFor } from '@cs/billing';
import { type EnvName, agency, billingNotice } from '@cs/db';
import { and, asc, eq, isNull, lt, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { WorkerDeps } from '../deps';
import { defineJob } from '../jobs';

export const BILLING_NOTICE_MAX_ATTEMPTS = 5;
const BATCH = 100;

export interface BillingNoticeJobOptions {
  /** The live environment (`resolveActiveEnvName`); DEMO and TEST never mail billing notices (R6). */
  envName: EnvName;
}

type Admin = { id: string; email: string };

/** All recipients rejected: roll the claim back and record the (last) error on the row. */
class SendFailed extends Error {}

/**
 * Phase 9a Task 7: drains the `billing_notice` outbox every 5 minutes. One platform-branded email per active agency admin
 * (never account managers or client users), sent directly (not via the client notification outbox). A row is claimed with
 * `FOR UPDATE SKIP LOCKED` in its own transaction, so two overlapping runs never mail the same row twice. Logs ids and
 * counts only: no addresses, names or params.
 */
export function createBillingNoticeJobs(deps: WorkerDeps, opts: BillingNoticeJobOptions) {
  const notices = defineJob({
    name: 'billing-notices',
    schema: z.looseObject({}),
    cron: '*/5 * * * *',
    queue: { expireInSeconds: 600 },
    handler: async () => {
      if (opts.envName === 'demo' || opts.envName === 'test') {
        console.log(`[billing-notices] skipped in ${opts.envName}`);
        return { skipped: opts.envName };
      }
      const db = deps.serviceDb();
      const mail = deps.billingEmail();
      const pending = await db
        .select({ id: billingNotice.id })
        .from(billingNotice)
        .where(and(eq(billingNotice.audience, 'agency'), isNull(billingNotice.sentAt), lt(billingNotice.attempts, BILLING_NOTICE_MAX_ATTEMPTS)))
        .orderBy(asc(billingNotice.createdAt))
        .limit(BATCH);
      const out = { sent: 0, skipped: 0, failed: 0, locked: 0 };
      for (const { id } of pending) {
        let failure: string | null = null;
        try {
          await db.transaction(async (tx) => {
            const [row] = await tx
              .select()
              .from(billingNotice)
              .where(and(eq(billingNotice.id, id), eq(billingNotice.audience, 'agency'), isNull(billingNotice.sentAt), lt(billingNotice.attempts, BILLING_NOTICE_MAX_ATTEMPTS)))
              .for('update', { skipLocked: true });
            if (!row) {
              out.locked++;
              return;
            }
            const email = noticeEmailFor(row);
            if (!email) {
              out.skipped++;
            } else {
              const [ag] = await tx.select({ name: agency.name }).from(agency).where(eq(agency.id, row.agencyId));
              const admins = [
                ...(await tx.execute<Admin>(sql`
                  select distinct on (lower(u.email)) u.id, u.email
                  from membership m join auth."user" u on u.id = m.user_id
                  where m.agency_id = ${row.agencyId} and m.role = 'agency_admin'
                  order by lower(u.email)`)),
              ];
              if (admins.length === 0) console.warn(`[billing-notices] no agency admins for agency ${row.agencyId}`);
              const props = { kind: email.kind, agencyName: ag?.name ?? '', ...(email.date && { date: email.date }), billingUrl: `${mail.appUrl}/agency/settings/billing` };
              // Per recipient: one rejected address must not re-mail the others on retry. The row is sent if any send succeeded.
              let ok = 0;
              let lastErr = '';
              for (const a of admins) {
                try {
                  await mail.send(a.email, row.agencyId, props);
                  ok++;
                } catch (err) {
                  lastErr = err instanceof Error ? `${err.name}: ${err.message}` : 'unknown';
                  console.warn(`[billing-notices] send failed for admin user ${a.id} (agency ${row.agencyId})`);
                }
              }
              if (admins.length > 0 && ok === 0) throw new SendFailed(lastErr);
              out.sent++;
            }
            await tx.update(billingNotice).set({ sentAt: sql`now()`, lastError: null }).where(eq(billingNotice.id, row.id));
          });
        } catch (err) {
          failure = err instanceof Error ? `${err.name}: ${err.message}` : 'unknown';
          if (err instanceof SendFailed) failure = err.message;
        }
        if (failure !== null) {
          // Fresh statement after the transaction has rolled back: a failed row can never poison the run.
          out.failed++;
          await db
            .update(billingNotice)
            .set({ attempts: sql`${billingNotice.attempts} + 1`, lastError: failure.slice(0, 500) })
            .where(eq(billingNotice.id, id));
        }
      }
      console.log(`[billing-notices] ${JSON.stringify(out)}`);
      return { ...out };
    },
  });
  return { notices };
}
