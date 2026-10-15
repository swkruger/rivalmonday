import { noticeEmailFor } from '@cs/billing';
import { type EnvName, agency, billingNotice, client, clientBilling } from '@cs/db';
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

type Recipient = { id: string; email: string };

/** Client-facing (agency-branded) kinds, delivered to the client's owners. */
const CLIENT_KINDS = new Set(['client-payment-link', 'client-payment-needed']);
/** Agency-facing (Rival Monday-branded) kinds about one client, delivered to agency admins. */
const AGENCY_CLIENT_KINDS = new Set(['client-payment-failed', 'client-paid', 'client-auto-paused']);

const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);

/** All recipients rejected: roll the claim back and record the (last) error on the row. */
class SendFailed extends Error {}

/**
 * Per recipient: one rejected address must not re-mail the others on retry. Returns normally if any send succeeded (or there
 * was nobody to send to); throws `SendFailed` when every send was rejected.
 */
async function deliver(recipients: Recipient[], what: string, send: (to: string) => Promise<void>): Promise<void> {
  let ok = 0;
  let lastErr = '';
  for (const r of recipients) {
    try {
      await send(r.email);
      ok++;
    } catch (err) {
      lastErr = err instanceof Error ? `${err.name}: ${err.message}` : 'unknown';
      console.warn(`[billing-notices] send failed for ${what} user ${r.id}`);
    }
  }
  if (recipients.length > 0 && ok === 0) throw new SendFailed(lastErr);
}

/**
 * Phase 9a Task 7 + 9b Task 8: drains the `billing_notice` outbox every 5 minutes, sent directly (not via the client
 * notification outbox). Three audiences, all claimed with `FOR UPDATE SKIP LOCKED` in their own transaction so two overlapping
 * runs never mail the same row twice:
 *  - agency rows, 9a kinds: Rival Monday-branded, to active agency admins (never account managers or client users);
 *  - agency rows, 9b client kinds: Rival Monday-branded, to agency admins, naming the client;
 *  - client rows: agency-branded (no platform name), to the client's current `client_owner` memberships at send time.
 * Logs ids and counts only: no addresses, names, params or checkout URLs.
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
        .where(and(isNull(billingNotice.sentAt), lt(billingNotice.attempts, BILLING_NOTICE_MAX_ATTEMPTS)))
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
              .where(and(eq(billingNotice.id, id), isNull(billingNotice.sentAt), lt(billingNotice.attempts, BILLING_NOTICE_MAX_ATTEMPTS)))
              .for('update', { skipLocked: true });
            if (!row) {
              out.locked++;
              return;
            }
            const params = (row.params && typeof row.params === 'object' ? row.params : {}) as Record<string, unknown>;
            const [ag] = await tx.select({ name: agency.name, branding: agency.branding }).from(agency).where(eq(agency.id, row.agencyId));
            const adminsOf = async () => [
              ...(await tx.execute<Recipient>(sql`
                select distinct on (lower(u.email)) u.id, u.email
                from membership m join auth."user" u on u.id = m.user_id
                where m.agency_id = ${row.agencyId} and m.role = 'agency_admin'
                order by lower(u.email)`)),
            ];
            let skipReason: string | null = null;
            let nextParams: Record<string, unknown> | undefined;

            if (row.audience === 'client') {
              // The one-time Checkout link must not outlive its delivery attempt (sent or skipped): drop it in the same update.
              const { checkoutUrl: _drop, ...rest } = params;
              nextParams = rest;
              const checkoutUrl = str(params.checkoutUrl);
              if (!CLIENT_KINDS.has(row.kind) || !row.clientId) {
                skipReason = 'skipped: unsupported notice';
              } else {
                const [cb] = await tx.select({ state: clientBilling.state }).from(clientBilling).where(eq(clientBilling.clientId, row.clientId));
                if (cb?.state === 'disconnected') {
                  skipReason = 'skipped: billing disconnected';
                } else {
                  const owners = [
                    ...(await tx.execute<Recipient>(sql`
                      select distinct on (lower(u.email)) u.id, u.email
                      from membership m join auth."user" u on u.id = m.user_id
                      where m.agency_id = ${row.agencyId} and m.client_id = ${row.clientId} and m.role = 'client_owner'
                      order by lower(u.email)`)),
                  ];
                  const actionUrl = row.kind === 'client-payment-link' ? checkoutUrl : `${mail.appUrl}/c/${row.clientId}/settings/billing`;
                  if (owners.length === 0) skipReason = 'skipped: no client owners';
                  else if (!actionUrl) skipReason = 'skipped: no checkout link';
                  else {
                    const clientId = row.clientId;
                    const kind = row.kind as 'client-payment-link' | 'client-payment-needed';
                    await deliver(owners, `client owner (client ${clientId})`, (to) =>
                      mail.sendClient(to, row.agencyId, clientId, { agencyName: ag?.name ?? '', branding: ag?.branding ?? null }, { kind, actionUrl }),
                    );
                  }
                }
              }
            } else if (AGENCY_CLIENT_KINDS.has(row.kind)) {
              let clientName = str(params.clientName);
              if (!clientName && row.clientId) clientName = (await tx.select({ name: client.name }).from(client).where(eq(client.id, row.clientId)))[0]?.name;
              if (!clientName) {
                skipReason = 'skipped: unknown client';
              } else {
                const admins = await adminsOf();
                if (admins.length === 0) console.warn(`[billing-notices] no agency admins for agency ${row.agencyId}`);
                const n = typeof params.n === 'number' ? params.n : undefined;
                const props = { kind: row.kind as 'client-payment-failed' | 'client-paid' | 'client-auto-paused', clientName, ...(n !== undefined && { n }), billingUrl: `${mail.appUrl}/agency/settings/billing` };
                await deliver(admins, `admin (agency ${row.agencyId})`, (to) => mail.sendAgencyClient(to, row.agencyId, props));
              }
            } else {
              const email = noticeEmailFor(row);
              if (!email) {
                skipReason = 'skipped';
              } else {
                const admins = await adminsOf();
                if (admins.length === 0) console.warn(`[billing-notices] no agency admins for agency ${row.agencyId}`);
                const props = { kind: email.kind, agencyName: ag?.name ?? '', ...(email.date && { date: email.date }), billingUrl: `${mail.appUrl}/agency/settings/billing` };
                await deliver(admins, `admin (agency ${row.agencyId})`, (to) => mail.send(to, row.agencyId, props));
              }
            }

            if (skipReason !== null) out.skipped++;
            else out.sent++;
            await tx
              .update(billingNotice)
              .set({ sentAt: sql`now()`, lastError: skipReason && skipReason !== 'skipped' ? skipReason : null, ...(nextParams && { params: nextParams }) })
              .where(eq(billingNotice.id, row.id));
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
