import type { EnvName } from '@cs/db';
import { DOMAIN_VERIFY_SECONDS, expireStaleDomains, listDomainsToVerify, SENDER_VERIFY_SECONDS, verifyAgencyDomain, verifySendingDomain } from '@cs/tools';
import { z } from 'zod';
import type { WorkerDeps } from '../deps';
import { defineJob } from '../jobs';
import { workerLog } from '../log';

/**
 * 13a1 Task 11 (P10, P12, P13): custom-domain and sending-domain verification. Each job checks once and, while the row is
 * not terminal and inside its 72 h window, re-enqueues itself (`startAfter`, same singleton key as the domain tools:
 * `domain:<id>` / `sender:<id>`). The hourly sweep re-enqueues rows that lost their job (web enqueue refused, a crash) and
 * fails rows past the window. Logs ids and outcomes only.
 */
export function createDomainJobs(
  deps: WorkerDeps,
  /** Must use `singletonKey` `domain:<id>` / `sender:<id>` (short policy: one queued check per row). */
  queue: { enqueueDomain(domainId: string, startAfterSeconds?: number): Promise<void>; enqueueSender(sendingDomainId: string, startAfterSeconds?: number): Promise<void> },
  opts: { envName: EnvName },
) {
  const notify = (n: Parameters<WorkerDeps['domainEmail']>[0]) => deps.domainEmail(n);
  const probe = (hostname: string) => deps.domainProbe(hostname, opts.envName);

  const domainVerify = defineJob({
    name: 'domain-verify',
    schema: z.object({ domainId: z.uuid() }),
    queue: { policy: 'short', retryLimit: 2 },
    handler: async ({ domainId }) => {
      const { vercel } = deps.domainVendors(opts.envName);
      if (!vercel) {
        workerLog.warn(`[domain-verify] ${domainId} skipped: Vercel is not configured`);
        return { skipped: 'not_configured' };
      }
      const result = await verifyAgencyDomain({ service: deps.serviceDb(), vercel, probe, notify }, domainId, new Date());
      if (result === 'again') await queue.enqueueDomain(domainId, DOMAIN_VERIFY_SECONDS);
      workerLog.info(`[domain-verify] ${domainId} → ${result}`);
      return { result };
    },
  });

  const senderVerify = defineJob({
    name: 'sender-verify',
    schema: z.object({ sendingDomainId: z.uuid() }),
    queue: { policy: 'short', retryLimit: 2 },
    handler: async ({ sendingDomainId }) => {
      const { postmark } = deps.domainVendors(opts.envName);
      if (!postmark) {
        workerLog.warn(`[sender-verify] ${sendingDomainId} skipped: Postmark is not configured`);
        return { skipped: 'not_configured' };
      }
      const result = await verifySendingDomain({ service: deps.serviceDb(), postmark, resolveTxt: (name) => deps.resolveTxt(name), notify }, sendingDomainId, new Date());
      if (result === 'again') await queue.enqueueSender(sendingDomainId, SENDER_VERIFY_SECONDS);
      workerLog.info(`[sender-verify] ${sendingDomainId} → ${result}`);
      return { result };
    },
  });

  const sweep = defineJob({
    name: 'domain-verify-sweep',
    schema: z.looseObject({}),
    cron: '23 * * * *',
    queue: { retryLimit: 1, expireInSeconds: 600 },
    handler: async () => {
      const now = new Date();
      const service = deps.serviceDb();
      const expired = await expireStaleDomains({ service, notify }, now);
      const { domainIds, sendingDomainIds } = await listDomainsToVerify(service, now);
      for (const id of domainIds) await queue.enqueueDomain(id);
      for (const id of sendingDomainIds) await queue.enqueueSender(id);
      const out = { expired, enqueued: { domains: domainIds.length, sendingDomains: sendingDomainIds.length } };
      workerLog.info(`[domain-verify-sweep] ${JSON.stringify(out)}`);
      return out;
    },
  });

  return { domainVerify, senderVerify, sweep };
}
