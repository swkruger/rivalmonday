import { noticeEmailFor } from '@cs/billing';
import { type EnvName, agency, agencyOnboarding, billingNotice, client, clientBilling } from '@cs/db';
import { clientOwnerEmails, platformOperatorEmails } from '@cs/tools';
import { and, asc, eq, isNull, lt, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { OnboardingEmail, WorkerDeps } from '../deps';
import { defineJob } from '../jobs';
import { workerLog } from '../log';

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
const AGENCY_CLIENT_KINDS = new Set(['client-payment-failed', 'client-paid', 'client-auto-paused', 'client_spend_paused', 'client-duplicate-subscription']);

const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);

/** Phase 10 (R5): sign-up lifecycle kinds, written by `enqueueSignupEmails` (welcome, notice) and `onboarding-nudges` (tips). */
const ONBOARDING_KINDS = new Set(['agency_welcome', 'platform_signup_notice', 'onboarding_tip']);
const TIP_DAYS = new Set([1, 3, 7]);
const TIP_STEPS = new Set(['profile', 'team', 'plan', 'branding', 'first_client']);
type TipProps = Extract<OnboardingEmail, { template: 'onboarding_tip' }>['props'];
type NoticeProps = Extract<OnboardingEmail, { template: 'platform_signup_notice' }>['props'];

/** The sign-up notice props from the row's params (null = malformed). The console page for one agency is 8a's. */
function signupNoticeProps(p: Record<string, unknown>, agencyId: string, appUrl: string): NoticeProps | null {
  const agencyName = str(p.agencyName);
  const email = str(p.email);
  const source = p.source === 'open' || p.source === 'invite' ? p.source : null;
  const offer = p.offer === 'trial' || p.offer === 'pilot' ? p.offer : null;
  if (!agencyName || !email || !source || !offer) return null;
  const pilotEndsAt = str(p.pilotEndsAt);
  return {
    agencyName, contactName: str(p.contactName) ?? null, email, source, offer, ...(pilotEndsAt && { pilotEndsAt }),
    consoleUrl: `${appUrl}/platform/agencies/${agencyId}`,
  };
}

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
      workerLog.warn(`[billing-notices] send failed for ${what} user ${r.id}`);
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
 *  - client rows: agency-branded (no platform name), to the client's current `client_owner` memberships at send time;
 *  - Phase 10 kinds: `agency_welcome` and `onboarding_tip` to agency admins, `platform_signup_notice` to owner|staff
 *    platform operators + PLATFORM_ADMIN_EMAILS (Rival Monday-branded; tips skipped once the agency unsubscribed).
 * Unknown kinds are still marked sent without mail.
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
        workerLog.info(`[billing-notices] skipped in ${opts.envName}`);
        return { skipped: opts.envName };
      }
      const db = deps.serviceDb();
      const mail = deps.billingEmail();
      // 7a2 D16: no archived-agency filter. Such a notice can only come from a live Stripe subscription, and the archive CLI refuses while one is active.
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
                  const owners: Recipient[] = (await clientOwnerEmails(tx, row.clientId, new Date())).map((email, i) => ({ id: `owner#${i + 1}`, email }));
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
            } else if (ONBOARDING_KINDS.has(row.kind)) {
              const onboardingUrl = `${mail.appUrl}/onboarding/start`;
              if (row.kind === 'agency_welcome') {
                const admins = await adminsOf();
                if (admins.length === 0) workerLog.warn(`[billing-notices] no agency admins for agency ${row.agencyId}`);
                const agencyName = str(params.agencyName) ?? ag?.name ?? '';
                await deliver(admins, `admin (agency ${row.agencyId})`, (to) =>
                  mail.sendOnboarding(to, row.agencyId, { template: 'agency_welcome', props: { agencyName, url: onboardingUrl } }),
                );
              } else if (row.kind === 'platform_signup_notice') {
                const props = signupNoticeProps(params, row.agencyId, mail.appUrl);
                // R13: owner|staff operators + PLATFORM_ADMIN_EMAILS; ids in logs are positional, never addresses.
                const ops = props ? await platformOperatorEmails({ service: db, platformAdmins: mail.platformAdmins }, ['owner', 'staff']) : [];
                if (!props) skipReason = 'skipped: bad params';
                else if (ops.length === 0) skipReason = 'skipped: no platform operators';
                else {
                  await deliver(ops.map((email, i) => ({ id: `operator#${i + 1}`, email })), `platform operator (agency ${row.agencyId})`, (to) =>
                    mail.sendOnboarding(to, row.agencyId, { template: 'platform_signup_notice', props }),
                  );
                }
              } else {
                // onboarding_tip: re-checked at send time so an unsubscribe, completion or dismissal between enqueue and delivery is honoured.
                const [ob] = await tx.select({ unsubscribedAt: agencyOnboarding.unsubscribedAt, completedAt: agencyOnboarding.completedAt, dismissedAt: agencyOnboarding.dismissedAt }).from(agencyOnboarding).where(eq(agencyOnboarding.agencyId, row.agencyId));
                const day = params.day;
                const nextStep = params.nextStep;
                if (!ag || !ob || ob.completedAt || ob.dismissedAt) skipReason = 'skipped: onboarding closed';
                else if (ob.unsubscribedAt) skipReason = 'skipped: unsubscribed';
                else if (typeof day !== 'number' || !TIP_DAYS.has(day) || typeof nextStep !== 'string' || !TIP_STEPS.has(nextStep)) skipReason = 'skipped: bad params';
                else {
                  const admins = await adminsOf();
                  if (admins.length === 0) workerLog.warn(`[billing-notices] no agency admins for agency ${row.agencyId}`);
                  const props: TipProps = { agencyName: ag?.name ?? '', day: day as TipProps['day'], nextStep: nextStep as TipProps['nextStep'], url: onboardingUrl };
                  await deliver(admins, `admin (agency ${row.agencyId})`, (to) => mail.sendOnboarding(to, row.agencyId, { template: 'onboarding_tip', props }));
                }
              }
            } else if (AGENCY_CLIENT_KINDS.has(row.kind)) {
              let clientName = str(params.clientName);
              if (!clientName && row.clientId) clientName = (await tx.select({ name: client.name }).from(client).where(eq(client.id, row.clientId)))[0]?.name;
              if (!clientName) {
                skipReason = 'skipped: unknown client';
              } else {
                const admins = await adminsOf();
                if (admins.length === 0) workerLog.warn(`[billing-notices] no agency admins for agency ${row.agencyId}`);
                const n = typeof params.n === 'number' ? params.n : undefined;
                const until = str(params.until);
                const props = {
                  kind: row.kind as Parameters<typeof mail.sendAgencyClient>[2]['kind'], clientName, ...(n !== undefined && { n }), ...(until && { until }),
                  // 7b1: a spend pause points at the usage page, not billing.
                  billingUrl: `${mail.appUrl}${row.kind === 'client_spend_paused' ? '/agency/settings/usage' : '/agency/settings/billing'}`,
                };
                await deliver(admins, `admin (agency ${row.agencyId})`, (to) => mail.sendAgencyClient(to, row.agencyId, props));
              }
            } else {
              const email = noticeEmailFor(row);
              if (!email) {
                skipReason = 'skipped';
              } else {
                const admins = await adminsOf();
                if (admins.length === 0) workerLog.warn(`[billing-notices] no agency admins for agency ${row.agencyId}`);
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
      workerLog.info(`[billing-notices] ${JSON.stringify(out)}`);
      return { ...out };
    },
  });
  return { notices };
}
