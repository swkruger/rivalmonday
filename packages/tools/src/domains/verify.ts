import { assertPublicUrl, type LookupFn } from '@cs/collectors';
import { agencyDomain, agencySendingDomain, type Db } from '@cs/db';
import { and, eq, gte, inArray, lt, sql } from 'drizzle-orm';
import { DomainVendorError, type PostmarkDomains, type VercelDomainState, type VercelDomains } from './errors';

/** 13a1 P12: a custom domain is re-checked every 10 min, a sending domain every 15 min, for up to 72 h after it was set. */
export const DOMAIN_VERIFY_SECONDS = 600;
export const SENDER_VERIFY_SECONDS = 900;
export const VERIFY_WINDOW_HOURS = 72;
const PROBE_TIMEOUT_MS = 10_000;

/** 13a1 P10: what the agency's admins are told after a status change (sent best effort, after the update). */
export type DomainNotice = { agencyId: string; kind: 'domain_live' | 'domain_failed' | 'sender_verified' | 'sender_failed'; name: string; error?: string };

/**
 * The only `error` texts the verify jobs store and mail (Task 9/10 ruling: never vendor free text). `timeout` is decided copy;
 * `txtMissing` is **Proposed copy** (Vercel reported its TXT ownership record missing or mismatched).
 */
export const VERIFY_COPY = {
  timeout: "We couldn't verify this domain within 72 hours.",
  txtMissing: "The TXT record for this domain is missing or doesn't match.",
} as const;

const windowEnd = (createdAt: Date) => new Date(createdAt.getTime() + VERIFY_WINDOW_HOURS * 3_600_000);
const pastWindow = (createdAt: Date, now: Date) => now.getTime() >= windowEnd(createdAt).getTime();
const ACTIVE_CUSTOM = ['pending', 'verifying'] as const;

/** Vendor text never leaves the log, and the log gets only `DomainVendorError`'s log-safe message (redacted, no query string). */
function logVendorFailure(what: string, id: string, e: unknown): void {
  if (e instanceof DomainVendorError) console.warn(`[domains] ${what} failed`, { id, code: e.code }, e.message);
  else console.warn(`[domains] ${what} failed`, { id }, (e as { name?: string } | null)?.name ?? 'unknown');
}

async function safeNotify(notify: (n: DomainNotice) => Promise<void>, n: DomainNotice): Promise<void> {
  try {
    await notify(n);
  } catch (e) {
    console.warn('[domains] notice failed', { agencyId: n.agencyId, kind: n.kind }, (e as { name?: string } | null)?.name ?? 'unknown');
  }
}

/**
 * SSRF-guarded certificate probe (13a1 P13, pre-flight F21): `https://<hostname>/health` must pass `assertPublicUrl` (same
 * `lookup`), then one `GET` with `redirect: 'manual'` and a 10 s timeout; only a 2xx is ok (Node validates the certificate).
 * Anything blocked, unresolvable, redirected or failing is `false`. The lookup/connect TOCTOU is accepted, as in `net/guard.ts`.
 */
export function createDomainProbe(o: { lookup?: LookupFn; fetch?: typeof fetch } = {}): (hostname: string) => Promise<boolean> {
  return async (hostname) => {
    let url: string;
    try {
      const u = new URL(`https://${hostname}/health`);
      if (u.hostname !== hostname.toLowerCase() || u.pathname !== '/health' || u.search || u.port) return false;
      url = u.href;
      await assertPublicUrl(url, o.lookup);
    } catch {
      return false;
    }
    try {
      const res = await (o.fetch ?? fetch)(url, { method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });
      await res.body?.cancel().catch(() => {});
      return res.status >= 200 && res.status < 300;
    } catch {
      return false;
    }
  };
}

/** Decided copy for a custom domain that ran out of time, from the last state Vercel reported. */
function customFailureCopy(last: VercelDomainState | null): string {
  return last && !last.verified && last.message ? VERIFY_COPY.txtMissing : VERIFY_COPY.timeout;
}

/**
 * One `domain-verify` run (13a1 P12/P13). Only `pending`/`verifying` rows; `vercel.status` outside any transaction; every
 * write is one conditional UPDATE (`status IN ('pending','verifying')`), so a removed (or already terminal) row is never
 * revived and only the run that makes a transition sends its notice. `again` = re-check later; `done` = terminal or gone.
 */
export async function verifyAgencyDomain(
  d: { service: Db; vercel: VercelDomains; probe: (hostname: string) => Promise<boolean>; notify: (n: DomainNotice) => Promise<void> },
  domainId: string,
  now: Date,
): Promise<'again' | 'done'> {
  const [row] = await d.service
    .select({ id: agencyDomain.id, agencyId: agencyDomain.agencyId, hostname: agencyDomain.hostname, status: agencyDomain.status, createdAt: agencyDomain.createdAt })
    .from(agencyDomain)
    .where(eq(agencyDomain.id, domainId));
  if (!row || !(ACTIVE_CUSTOM as readonly string[]).includes(row.status)) return 'done';
  const guard = and(eq(agencyDomain.id, row.id), inArray(agencyDomain.status, [...ACTIVE_CUSTOM]));

  let state: VercelDomainState | null = null;
  try {
    state = await d.vercel.status(row.hostname);
  } catch (e) {
    logVendorFailure('vercel status', row.id, e);
  }

  if (state) {
    const ready = state.verified && !state.misconfigured;
    const [updated] = await d.service
      .update(agencyDomain)
      .set({ dnsRecords: state.records, lastCheckedAt: now, ...(ready && { status: 'verifying' as const }) })
      .where(guard)
      .returning({ id: agencyDomain.id });
    if (!updated) return 'done'; // removed (or finished) meanwhile
    if (ready && (await d.probe(row.hostname))) {
      const [live] = await d.service.update(agencyDomain).set({ status: 'live', liveAt: now, error: null }).where(guard).returning({ id: agencyDomain.id });
      if (live) await safeNotify(d.notify, { agencyId: row.agencyId, kind: 'domain_live', name: row.hostname });
      return 'done';
    }
  }

  if (!pastWindow(row.createdAt, now)) return 'again';
  const error = customFailureCopy(state);
  const [failed] = await d.service.update(agencyDomain).set({ status: 'failed', error, lastCheckedAt: now }).where(guard).returning({ id: agencyDomain.id });
  if (failed) await safeNotify(d.notify, { agencyId: row.agencyId, kind: 'domain_failed', name: row.hostname, error });
  return 'done';
}

/** True when a TXT record at `_dmarc.<domain>` starts with `v=DMARC1`. A lookup failure is `false` (never blocks). */
async function hasDmarc(resolveTxt: (name: string) => Promise<string[][]>, domain: string): Promise<boolean> {
  try {
    const records = await resolveTxt(`_dmarc.${domain}`);
    return records.some((chunks) => chunks.join('').trim().startsWith('v=DMARC1'));
  } catch {
    return false;
  }
}

/**
 * One `sender-verify` run (13a1 P12). Only `pending` rows; Postmark DKIM + Return-Path verify calls outside any transaction;
 * both verified → `verified` (+ `dmarc_ok`), else `again` until 72 h, then `failed`. Writes are guarded by `status = 'pending'`.
 */
export async function verifySendingDomain(
  d: { service: Db; postmark: PostmarkDomains; resolveTxt: (name: string) => Promise<string[][]>; notify: (n: DomainNotice) => Promise<void> },
  id: string,
  now: Date,
): Promise<'again' | 'done'> {
  const [row] = await d.service
    .select({ id: agencySendingDomain.id, agencyId: agencySendingDomain.agencyId, domain: agencySendingDomain.domain, status: agencySendingDomain.status, postmarkDomainId: agencySendingDomain.postmarkDomainId, createdAt: agencySendingDomain.createdAt })
    .from(agencySendingDomain)
    .where(eq(agencySendingDomain.id, id));
  if (!row || row.status !== 'pending') return 'done';
  const guard = and(eq(agencySendingDomain.id, row.id), eq(agencySendingDomain.status, 'pending'));

  let verified = false;
  if (row.postmarkDomainId !== null) {
    try {
      const dkim = await d.postmark.verifyDkim(row.postmarkDomainId);
      const rp = await d.postmark.verifyReturnPath(row.postmarkDomainId);
      verified = dkim.dkim.verified && rp.returnPath.verified;
      const [checked] = await d.service
        .update(agencySendingDomain)
        .set({ lastCheckedAt: now })
        .where(guard)
        .returning({ id: agencySendingDomain.id });
      if (!checked) return 'done'; // removed meanwhile
    } catch (e) {
      logVendorFailure('postmark verify', row.id, e);
    }
  }

  if (verified) {
    const dmarcOk = await hasDmarc(d.resolveTxt, row.domain);
    const [done] = await d.service.update(agencySendingDomain).set({ status: 'verified', verifiedAt: now, dmarcOk, error: null }).where(guard).returning({ id: agencySendingDomain.id });
    if (done) await safeNotify(d.notify, { agencyId: row.agencyId, kind: 'sender_verified', name: row.domain });
    return 'done';
  }

  if (!pastWindow(row.createdAt, now)) return 'again';
  const error = VERIFY_COPY.timeout;
  const [failed] = await d.service.update(agencySendingDomain).set({ status: 'failed', error, lastCheckedAt: now }).where(guard).returning({ id: agencySendingDomain.id });
  if (failed) await safeNotify(d.notify, { agencyId: row.agencyId, kind: 'sender_failed', name: row.domain, error });
  return 'done';
}

/** Sweep input (Task 11 carry 3): rows still being verified inside their 72 h window; each gets a verify job (singleton = id). */
export async function listDomainsToVerify(service: Db, now: Date): Promise<{ domainIds: string[]; sendingDomainIds: string[] }> {
  const since = new Date(now.getTime() - VERIFY_WINDOW_HOURS * 3_600_000);
  const domains = await service.select({ id: agencyDomain.id }).from(agencyDomain).where(and(inArray(agencyDomain.status, [...ACTIVE_CUSTOM]), gte(agencyDomain.createdAt, since)));
  const sending = await service.select({ id: agencySendingDomain.id }).from(agencySendingDomain).where(and(eq(agencySendingDomain.status, 'pending'), gte(agencySendingDomain.createdAt, since)));
  return { domainIds: domains.map((r) => r.id), sendingDomainIds: sending.map((r) => r.id) };
}

/** Sweep: rows past their 72 h window that no job finished → `failed` with the timeout copy; one notice per transition. */
export async function expireStaleDomains(d: { service: Db; notify: (n: DomainNotice) => Promise<void> }, now: Date): Promise<{ domains: number; sendingDomains: number }> {
  const since = new Date(now.getTime() - VERIFY_WINDOW_HOURS * 3_600_000);
  const error = VERIFY_COPY.timeout;
  const domains = await d.service
    .update(agencyDomain)
    .set({ status: 'failed', error })
    .where(and(inArray(agencyDomain.status, [...ACTIVE_CUSTOM]), lt(agencyDomain.createdAt, since)))
    .returning({ agencyId: agencyDomain.agencyId, name: agencyDomain.hostname });
  const sending = await d.service
    .update(agencySendingDomain)
    .set({ status: 'failed', error })
    .where(and(eq(agencySendingDomain.status, 'pending'), lt(agencySendingDomain.createdAt, since)))
    .returning({ agencyId: agencySendingDomain.agencyId, name: agencySendingDomain.domain });
  for (const r of domains) await safeNotify(d.notify, { agencyId: r.agencyId, kind: 'domain_failed', name: r.name, error });
  for (const r of sending) await safeNotify(d.notify, { agencyId: r.agencyId, kind: 'sender_failed', name: r.name, error });
  return { domains: domains.length, sendingDomains: sending.length };
}

/** 13a1 P10: the agency's active agency-admin contacts (lower-cased, de-duplicated, sorted). */
export async function domainNoticeRecipients(service: Db, agencyId: string): Promise<string[]> {
  const rows = await service.execute<{ email: string }>(sql`
    select distinct lower(email) as email from contact
    where agency_id = ${agencyId} and role = 'agency_admin' and client_id is null and active
    order by email`);
  return [...rows].map((r) => r.email);
}
