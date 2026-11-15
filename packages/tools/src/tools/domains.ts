import { type AccessContext, toolkit, ToolError, type ToolErrorCode } from '@cs/core';
import { agency, agencyDomain, agencySendingDomain, fallbackHostname, type HostEnv } from '@cs/db';
import { clientFromAddress } from '@cs/engine';
import { and, eq, ne, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { EnqueueJob, QueueJob, ToolDeps } from '../deps';
import { DomainVendorError, type PostmarkDomains, type VercelDomains } from '../domains/errors';
import { customHostnameProblem, normaliseHostname, sendingDomainProblem } from '../domains/hostname';
import { uniqueViolationConstraint } from '../settings';
import { AgencyDomainsView } from './schemas';

/**
 * Phase 13a1 (spec 13a § Interfaces, D2/D5): self-serve custom web subdomain (Vercel) and sending domain (Postmark).
 * Agency admin only, web channel only, audited by the registry (`runTool`). Rows are written on `deps.service` (the tables
 * are service-role writes, 0112); only `normaliseHostname` output is stored or sent to a vendor. Vendor text never reaches
 * the user: every refusal is decided copy. Held agencies are refused by `billingWriteGuard` (not on the allow-list).
 */
const { defineTool } = toolkit<ToolDeps>();

/** Decided copy (2026-10-17 plan) + proposed lines (13a1 Task 10, marked). */
export const DOMAIN_COPY = {
  apex: 'Use a subdomain such as intel.youragency.com.',
  inUse: 'This domain is already in use.',
  invalid: 'Enter a domain such as intel.youragency.com.',
  reserved: "That domain can't be used.",
  oneAtATime: 'Remove the current domain first.',
  notConfigured: 'Custom domains are not set up on this server yet.',
  /** Proposed copy. */
  sendingInvalid: 'Enter a domain such as youragency.com.',
  /** Proposed copy. */
  localPartInvalid: 'Use lower-case letters, digits, dots, hyphens or underscores.',
  /** Proposed copy: a vendor that is down or refused for a reason we cannot name. */
  unavailable: "We couldn't reach the domain service. Please try again in a few minutes.",
} as const;

const LOCAL_PART_RE = /^[a-z0-9][a-z0-9._-]{0,39}$/;
const DEFAULT_LOCAL_PART = 'briefs';

/** R19: decided copy shown as is (`conflict` included). */
const refuse = (code: ToolErrorCode, message: string) => new ToolError(code, message, { userFacing: true });

function requireAdmin(ctx: AccessContext) {
  if (ctx.role !== 'agency_admin' || ctx.userId.startsWith('contact:')) throw new ToolError('permission_denied', 'Only the agency admin can manage domains');
}

function hostEnvOf(deps: ToolDeps): HostEnv {
  if (!deps.hostEnv) throw refuse('invalid_input', DOMAIN_COPY.notConfigured);
  return deps.hostEnv;
}
function vendorOf<K extends 'vercel' | 'postmark'>(deps: ToolDeps, k: K): K extends 'vercel' ? VercelDomains : PostmarkDomains {
  const v = deps.domains?.[k];
  if (!deps.hostEnv || !v) throw refuse('invalid_input', DOMAIN_COPY.notConfigured);
  return v as K extends 'vercel' ? VercelDomains : PostmarkDomains;
}

/** The platform sender's domain (`EMAIL_FROM`, else briefs@<APP_URL host>): never an agency sending domain. */
function platformSenderDomains(deps: ToolDeps): string[] {
  const from = deps.delivery?.platformFrom || deps.leadEmail?.sender.platformFrom || '';
  const at = from.lastIndexOf('@');
  return at > 0 ? [from.slice(at + 1).replace(/>\s*$/, '').trim()] : [];
}

/** A vendor failure as decided copy (`invalid` → `invalidCopy` when given, else the retry copy); logs only the (log-safe) vendor code and message, never to the user. */
function vendorRefusal(e: unknown, what: string, agencyId: string, invalidCopy?: string): ToolError {
  if (e instanceof DomainVendorError) {
    console.error(`[domains] ${what} failed`, { agencyId, code: e.code }, e.message);
    if (e.code === 'in_use') return refuse('conflict', DOMAIN_COPY.inUse);
    if (e.code === 'invalid' && invalidCopy) return refuse('invalid_input', invalidCopy);
  } else {
    console.error(`[domains] ${what} failed`, { agencyId }, (e as { name?: string } | null)?.name);
  }
  return refuse('internal', DOMAIN_COPY.unavailable);
}

/**
 * The verify job is best-effort: the row and the vendor state are already in place, so a queue failure must not undo them
 * (DEMO/TEST refuse jobs). Logged; the worker's verify job (or a later set) picks the row up.
 */
async function enqueueVerify(deps: ToolDeps, job: QueueJob, data: Record<string, string>, singletonKey: string): Promise<void> {
  const enqueue: EnqueueJob | undefined = deps.enqueue;
  if (!enqueue) {
    console.error(`[domains] ${job} not enqueued: background jobs are not configured`, { singletonKey });
    return;
  }
  await enqueue(job, data, singletonKey).catch((e: unknown) => {
    console.error(`[domains] ${job} enqueue failed`, { singletonKey }, (e as { name?: string } | null)?.name);
  });
}

const OK = z.object({ ok: z.literal(true) });

export const getAgencyDomainsTool = defineTool({
  name: 'get_agency_domains',
  access: 'read',
  description: "The agency's client web address (fallback host and custom subdomain with its DNS records) and its sending domain (DKIM / Return-Path records and the From address client email uses now).",
  input: z.object({}),
  output: AgencyDomainsView,
  permission: 'agency',
  async handler(ctx, _input, deps) {
    requireAdmin(ctx);
    const h = hostEnvOf(deps);
    // One row: the agency with its current (non-removed) domain rows (partial unique indexes: at most one each).
    const [[row], fromAddress] = await Promise.all([
      deps.service
        .select({ hostSlug: agency.hostSlug, d: agencyDomain, s: agencySendingDomain })
        .from(agency)
        .leftJoin(agencyDomain, and(eq(agencyDomain.agencyId, agency.id), ne(agencyDomain.status, 'removed')))
        .leftJoin(agencySendingDomain, and(eq(agencySendingDomain.agencyId, agency.id), ne(agencySendingDomain.status, 'removed')))
        .where(eq(agency.id, ctx.agencyId))
        .limit(1),
      clientFromAddress(deps.service, ctx.agencyId, h),
    ]);
    if (!row) throw new ToolError('not_found', 'Agency not found');
    const { d, s } = row;
    return {
      fallbackHost: fallbackHostname(h, row.hostSlug),
      fromAddress,
      custom: d && d.status !== 'removed'
        ? { hostname: d.hostname, status: d.status, dnsRecords: d.dnsRecords, error: d.error, liveAt: d.liveAt?.toISOString() ?? null }
        : null,
      sending: s && s.status !== 'removed'
        ? {
          domain: s.domain, localPart: s.localPart, status: s.status,
          dkim: s.dkimHost && s.dkimValue ? { host: s.dkimHost, value: s.dkimValue } : null,
          returnPath: s.returnPathHost && s.returnPathValue ? { host: s.returnPathHost, value: s.returnPathValue } : null,
          dmarcOk: s.dmarcOk, error: s.error,
        }
        : null,
    };
  },
});

export const setCustomDomainTool = defineTool({
  name: 'set_custom_domain',
  access: 'write',
  description: "Set the agency's custom client subdomain (e.g. intel.youragency.com): adds it to the web host and returns once the DNS records are ready to show.",
  input: z.object({ hostname: z.string().trim().max(253) }),
  output: OK,
  permission: 'agency',
  async handler(ctx, input, deps) {
    requireAdmin(ctx);
    const vercel = vendorOf(deps, 'vercel');
    const problem = customHostnameProblem(input.hostname, hostEnvOf(deps));
    if (problem) throw refuse('invalid_input', DOMAIN_COPY[problem]);
    const hostname = normaliseHostname(input.hostname)!;

    const active = await deps.service
      .select({ agencyId: agencyDomain.agencyId, hostname: agencyDomain.hostname })
      .from(agencyDomain)
      .where(and(ne(agencyDomain.status, 'removed'), eq(agencyDomain.agencyId, ctx.agencyId)))
      .union(deps.service.select({ agencyId: agencyDomain.agencyId, hostname: agencyDomain.hostname }).from(agencyDomain).where(and(ne(agencyDomain.status, 'removed'), eq(agencyDomain.hostname, hostname))));
    if (active.some((r) => r.agencyId === ctx.agencyId)) throw refuse('conflict', DOMAIN_COPY.oneAtATime);
    if (active.length > 0) throw refuse('conflict', DOMAIN_COPY.inUse);

    let id: string;
    try {
      [{ id }] = (await deps.service.insert(agencyDomain).values({ agencyId: ctx.agencyId, hostname, status: 'pending' }).returning({ id: agencyDomain.id })) as [{ id: string }];
    } catch (e) {
      const c = uniqueViolationConstraint(e);
      if (c === null) throw e;
      throw refuse('conflict', c === 'agency_domain_one_per_agency' ? DOMAIN_COPY.oneAtATime : DOMAIN_COPY.inUse);
    }

    let records;
    try {
      records = (await vercel.add(hostname)).records;
    } catch (e) {
      await deps.service.delete(agencyDomain).where(eq(agencyDomain.id, id));
      throw vendorRefusal(e, 'vercel add', ctx.agencyId, DOMAIN_COPY.invalid);
    }
    await deps.service.update(agencyDomain).set({ dnsRecords: records, lastCheckedAt: new Date() }).where(eq(agencyDomain.id, id));
    await enqueueVerify(deps, 'domain-verify', { domainId: id }, `domain:${id}`);
    return { ok: true as const };
  },
});

export const removeCustomDomainTool = defineTool({
  name: 'remove_custom_domain',
  access: 'write',
  description: "Remove the agency's custom client subdomain; client links go back to the fallback address.",
  input: z.object({}),
  output: OK,
  permission: 'agency',
  async handler(ctx, _input, deps) {
    requireAdmin(ctx);
    const vercel = vendorOf(deps, 'vercel');
    const [row] = await deps.service.select({ id: agencyDomain.id, hostname: agencyDomain.hostname }).from(agencyDomain)
      .where(and(eq(agencyDomain.agencyId, ctx.agencyId), ne(agencyDomain.status, 'removed')));
    if (!row) return { ok: true as const };
    try {
      await vercel.remove(row.hostname); // a domain Vercel no longer has (404) resolves
    } catch (e) {
      throw vendorRefusal(e, 'vercel remove', ctx.agencyId);
    }
    await deps.service.update(agencyDomain).set({ status: 'removed', removedAt: new Date() })
      .where(and(eq(agencyDomain.id, row.id), ne(agencyDomain.status, 'removed')));
    return { ok: true as const };
  },
});

export const setSendingDomainTool = defineTool({
  name: 'set_sending_domain',
  access: 'write',
  description: "Set the agency's own email sending domain (e.g. youragency.com) and the address name before the @ (default briefs); returns once the DKIM and Return-Path records are ready to show.",
  input: z.object({ domain: z.string().trim().max(253), localPart: z.string().trim().max(64).optional() }),
  output: OK,
  permission: 'agency',
  async handler(ctx, input, deps) {
    requireAdmin(ctx);
    const postmark = vendorOf(deps, 'postmark');
    if (input.localPart !== undefined && !LOCAL_PART_RE.test(input.localPart)) throw refuse('invalid_input', DOMAIN_COPY.localPartInvalid);
    const problem = sendingDomainProblem(input.domain, hostEnvOf(deps), platformSenderDomains(deps));
    if (problem) throw refuse('invalid_input', problem === 'reserved' ? DOMAIN_COPY.reserved : DOMAIN_COPY.sendingInvalid);
    const domain = normaliseHostname(input.domain)!;

    const active = await deps.service
      .select({ agencyId: agencySendingDomain.agencyId })
      .from(agencySendingDomain)
      .where(and(ne(agencySendingDomain.status, 'removed'), eq(agencySendingDomain.agencyId, ctx.agencyId)))
      .union(deps.service.select({ agencyId: agencySendingDomain.agencyId }).from(agencySendingDomain).where(and(ne(agencySendingDomain.status, 'removed'), eq(agencySendingDomain.domain, domain))));
    if (active.some((r) => r.agencyId === ctx.agencyId)) throw refuse('conflict', DOMAIN_COPY.oneAtATime);
    if (active.length > 0) throw refuse('conflict', DOMAIN_COPY.inUse);

    let id: string;
    try {
      [{ id }] = (await deps.service.insert(agencySendingDomain)
        .values({ agencyId: ctx.agencyId, domain, localPart: input.localPart ?? DEFAULT_LOCAL_PART, status: 'pending' })
        .returning({ id: agencySendingDomain.id })) as [{ id: string }];
    } catch (e) {
      const c = uniqueViolationConstraint(e);
      if (c === null) throw e;
      throw refuse('conflict', c === 'agency_sending_domain_domain_active' ? DOMAIN_COPY.inUse : DOMAIN_COPY.oneAtATime);
    }

    let pm;
    try {
      // An unverified domain already on our (shared) account is read back (an earlier crashed create); a verified one is in_use.
      pm = await postmark.create(domain);
    } catch (e) {
      await deps.service.delete(agencySendingDomain).where(eq(agencySendingDomain.id, id));
      throw vendorRefusal(e, 'postmark create', ctx.agencyId, DOMAIN_COPY.sendingInvalid);
    }
    // Adopt the Postmark domain only if no other current row holds it (a read-back must never hand one agency another's domain).
    const pmId = pm.id;
    const adopted = await deps.service.update(agencySendingDomain).set({
      postmarkDomainId: pmId, dkimHost: pm.dkim.host, dkimValue: pm.dkim.value, returnPathHost: pm.returnPath.host, returnPathValue: pm.returnPath.value, lastCheckedAt: new Date(),
    }).where(and(eq(agencySendingDomain.id, id), sql`NOT EXISTS (SELECT 1 FROM agency_sending_domain o WHERE o.postmark_domain_id = ${pmId} AND o.id <> ${id} AND o.status <> 'removed')`))
      .returning({ id: agencySendingDomain.id });
    if (adopted.length === 0) {
      await deps.service.delete(agencySendingDomain).where(eq(agencySendingDomain.id, id));
      console.error('[domains] postmark domain already held by another row', { agencyId: ctx.agencyId, existing: !!pm.existing });
      throw refuse('conflict', DOMAIN_COPY.inUse); // the Postmark domain stays (it belongs to the other row)
    }
    await enqueueVerify(deps, 'sender-verify', { sendingDomainId: id }, `sender:${id}`);
    return { ok: true as const };
  },
});

export const removeSendingDomainTool = defineTool({
  name: 'remove_sending_domain',
  access: 'write',
  description: "Remove the agency's sending domain; client email goes back to the fallback address immediately.",
  input: z.object({}),
  output: OK,
  permission: 'agency',
  async handler(ctx, _input, deps) {
    requireAdmin(ctx);
    const postmark = vendorOf(deps, 'postmark');
    const [row] = await deps.service.select({ id: agencySendingDomain.id, postmarkDomainId: agencySendingDomain.postmarkDomainId }).from(agencySendingDomain)
      .where(and(eq(agencySendingDomain.agencyId, ctx.agencyId), ne(agencySendingDomain.status, 'removed')));
    if (!row) return { ok: true as const };
    if (row.postmarkDomainId != null) {
      try {
        await postmark.remove(row.postmarkDomainId); // an already-deleted domain resolves
      } catch (e) {
        throw vendorRefusal(e, 'postmark remove', ctx.agencyId);
      }
    }
    await deps.service.update(agencySendingDomain).set({ status: 'removed' })
      .where(and(eq(agencySendingDomain.id, row.id), ne(agencySendingDomain.status, 'removed')));
    return { ok: true as const };
  },
});

export const domainTools = [getAgencyDomainsTool, setCustomDomainTool, removeCustomDomainTool, setSendingDomainTool, removeSendingDomainTool];
