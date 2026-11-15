import type PgBoss from 'pg-boss';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const tools = vi.hoisted(() => ({
  verifyAgencyDomain: vi.fn(),
  verifySendingDomain: vi.fn(),
  listDomainsToVerify: vi.fn(),
  expireStaleDomains: vi.fn(),
}));
vi.mock('@cs/tools', async (orig) => ({ ...(await orig<typeof import('@cs/tools')>()), ...tools }));

import type { WorkerDeps } from '../deps';
import { createJobList } from '../job-list';
import { createDomainJobs } from './domains';

const ID = '00000000-0000-4000-8000-0000000000d1';
const SID = '00000000-0000-4000-8000-0000000000d2';
const vercel = { add: vi.fn(), remove: vi.fn(), status: vi.fn() };
const postmark = { create: vi.fn(), remove: vi.fn(), verifyDkim: vi.fn(), verifyReturnPath: vi.fn() };
const db = { db: true };

function depsWith(vendors: { vercel: unknown; postmark: unknown }) {
  return {
    serviceDb: () => db,
    domainVendors: vi.fn(() => vendors),
    domainProbe: vi.fn(async () => true),
    resolveTxt: vi.fn(async () => []),
    domainEmail: vi.fn(async () => {}),
  } as unknown as WorkerDeps & { domainVendors: ReturnType<typeof vi.fn> };
}

beforeEach(() => {
  for (const f of Object.values(tools)) f.mockReset();
});

describe('domain jobs', () => {
  it('again re-enqueues with startAfter 600 and the singleton', async () => {
    const sends: { name: string; data: unknown; opts: unknown }[] = [];
    const boss = { send: async (name: string, data: unknown, opts: unknown) => (sends.push({ name, data, opts }), 'job') } as unknown as PgBoss;
    const deps = depsWith({ vercel, postmark });
    const jobs = createJobList(deps, boss, { envName: 'dev', env: {} });
    tools.verifyAgencyDomain.mockResolvedValue('again');
    tools.verifySendingDomain.mockResolvedValue('again');
    expect(await jobs.find((j) => j.name === 'domain-verify')!.handler({ domainId: ID })).toEqual({ result: 'again' });
    expect(await jobs.find((j) => j.name === 'sender-verify')!.handler({ sendingDomainId: SID })).toEqual({ result: 'again' });
    expect(sends).toEqual([
      { name: 'domain-verify', data: { domainId: ID }, opts: { singletonKey: `domain:${ID}`, startAfter: 600 } },
      { name: 'sender-verify', data: { sendingDomainId: SID }, opts: { singletonKey: `sender:${SID}`, startAfter: 900 } },
    ]);
    expect(deps.domainVendors).toHaveBeenCalledWith('dev');
    const [d, id, now] = tools.verifyAgencyDomain.mock.calls[0]!;
    expect(d).toMatchObject({ service: db, vercel });
    expect(id).toBe(ID);
    expect(now).toBeInstanceOf(Date);
    // notify and probe are the deps' own (best-effort email, SSRF-guarded probe)
    await d.notify({ agencyId: 'a', kind: 'domain_live', name: 'x' });
    expect(deps.domainEmail).toHaveBeenCalled();
    await d.probe('x.example.com');
    expect(deps.domainProbe).toHaveBeenCalledWith('x.example.com');
  });

  it('done → no re-enqueue', async () => {
    const queue = { enqueueDomain: vi.fn(), enqueueSender: vi.fn() };
    const jobs = createDomainJobs(depsWith({ vercel, postmark }), queue, { envName: 'dev' });
    tools.verifyAgencyDomain.mockResolvedValue('done');
    tools.verifySendingDomain.mockResolvedValue('done');
    await jobs.domainVerify.handler({ domainId: ID });
    await jobs.senderVerify.handler({ sendingDomainId: SID });
    expect(queue.enqueueDomain).not.toHaveBeenCalled();
    expect(queue.enqueueSender).not.toHaveBeenCalled();
  });

  it('vendors null → logged and done, no verify call, no re-enqueue', async () => {
    const queue = { enqueueDomain: vi.fn(), enqueueSender: vi.fn() };
    const jobs = createDomainJobs(depsWith({ vercel: null, postmark: null }), queue, { envName: 'dev' });
    expect(await jobs.domainVerify.handler({ domainId: ID })).toEqual({ skipped: 'not_configured' });
    expect(await jobs.senderVerify.handler({ sendingDomainId: SID })).toEqual({ skipped: 'not_configured' });
    expect(tools.verifyAgencyDomain).not.toHaveBeenCalled();
    expect(tools.verifySendingDomain).not.toHaveBeenCalled();
    expect(queue.enqueueDomain).not.toHaveBeenCalled();
  });

  it('queues: short policy, retryLimit 2; the sweep is a cron job', () => {
    const jobs = createDomainJobs(depsWith({ vercel, postmark }), { enqueueDomain: vi.fn(), enqueueSender: vi.fn() }, { envName: 'dev' });
    expect(jobs.domainVerify.queue).toMatchObject({ policy: 'short', retryLimit: 2 });
    expect(jobs.senderVerify.queue).toMatchObject({ policy: 'short', retryLimit: 2 });
    expect(jobs.sweep.cron).toMatch(/^\d+ \* \* \* \*$/);
  });

  it('sweep expires stale rows, then enqueues every row in its window (singleton per id, no startAfter)', async () => {
    const queue = { enqueueDomain: vi.fn(async () => {}), enqueueSender: vi.fn(async () => {}) };
    const deps = depsWith({ vercel, postmark });
    const jobs = createDomainJobs(deps, queue, { envName: 'dev' });
    tools.expireStaleDomains.mockResolvedValue({ domains: 1, sendingDomains: 0 });
    tools.listDomainsToVerify.mockResolvedValue({ domainIds: [ID], sendingDomainIds: [SID] });
    expect(await jobs.sweep.handler({})).toEqual({ expired: { domains: 1, sendingDomains: 0 }, enqueued: { domains: 1, sendingDomains: 1 } });
    expect(tools.expireStaleDomains.mock.calls[0]![0]).toMatchObject({ service: db });
    expect(queue.enqueueDomain).toHaveBeenCalledWith(ID);
    expect(queue.enqueueSender).toHaveBeenCalledWith(SID);
  });

  it('the job list wires the sweep to the singleton keys', async () => {
    const sends: { name: string; data: unknown; opts: unknown }[] = [];
    const boss = { send: async (name: string, data: unknown, opts: unknown) => (sends.push({ name, data, opts }), 'job') } as unknown as PgBoss;
    const jobs = createJobList(depsWith({ vercel, postmark }), boss, { envName: 'dev', env: {} });
    tools.expireStaleDomains.mockResolvedValue({ domains: 0, sendingDomains: 0 });
    tools.listDomainsToVerify.mockResolvedValue({ domainIds: [ID], sendingDomainIds: [SID] });
    await jobs.find((j) => j.name === 'domain-verify-sweep')!.handler({});
    expect(sends).toEqual([
      { name: 'domain-verify', data: { domainId: ID }, opts: { singletonKey: `domain:${ID}` } },
      { name: 'sender-verify', data: { sendingDomainId: SID }, opts: { singletonKey: `sender:${SID}` } },
    ]);
  });
});
