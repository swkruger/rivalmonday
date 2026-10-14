import { billingNotice, membership } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { asc, eq, sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BillingEmailSender, WorkerDeps } from '../deps';
import { createBillingNoticeJobs } from './billing-notices';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
afterEach(() => vi.restoreAllMocks());

type Sent = { to: string; agencyId: string; props: Parameters<BillingEmailSender['send']>[2] };
let sent: Sent[] = [];
let send: BillingEmailSender['send'];
const deps = { serviceDb: () => dbs.service, billingEmail: () => ({ appUrl: 'https://app.rm.test', send: (...a: Parameters<BillingEmailSender['send']>) => send(...a) }) } as unknown as WorkerDeps;
const run = (envName: 'dev' | 'demo' | 'test' = 'dev') => createBillingNoticeJobs(deps, { envName }).notices.handler({});

const user = (id: string, email: string) => dbs.owner.execute(sql`insert into auth."user" (id, name, email, "emailVerified") values (${id}, ${id}, ${email}, true)`);
const notice = (kind: string, params: Record<string, unknown> = {}, key = `${kind}:${Math.random()}`) =>
  dbs.owner.insert(billingNotice).values({ agencyId: IDS.agencyA, kind, params, dedupeKey: key }).returning({ id: billingNotice.id });
const rowOf = async (id: string) => (await dbs.owner.select().from(billingNotice).where(eq(billingNotice.id, id)))[0]!;

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await dbs.owner.execute(sql`truncate auth."user" cascade`);
  await seedTenancy(dbs.owner);
  await user('a1', 'ann@agency-a.test');
  await user('a2', 'ben@agency-a.test');
  await user('m1', 'mia@agency-a.test');
  await dbs.owner.insert(membership).values([
    { userId: 'a1', agencyId: IDS.agencyA, role: 'agency_admin', createdBy: 'test' },
    { userId: 'a2', agencyId: IDS.agencyA, role: 'agency_admin', createdBy: 'test' },
    { userId: 'm1', agencyId: IDS.agencyA, role: 'account_manager', createdBy: 'test' },
  ]);
  sent = [];
  send = async (to, agencyId, props) => void sent.push({ to, agencyId, props });
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('billing-notices', () => {
  it('declares name and 5-minute cron', () => {
    expect(createBillingNoticeJobs(deps, { envName: 'dev' }).notices).toMatchObject({ name: 'billing-notices', cron: '*/5 * * * *' });
  });

  it.each(['demo', 'test'] as const)('returns early in %s without sending', async (envName) => {
    const [n] = await notice('billing_read_only');
    expect(await run(envName)).toEqual({ skipped: envName });
    expect(sent).toHaveLength(0);
    expect((await rowOf(n!.id)).sentAt).toBeNull();
  });

  it('mails agency admins only (not account managers), with the billing URL, and marks the row sent', async () => {
    const [n] = await notice('billing_read_only');
    await run();
    expect(sent.map((s) => s.to).sort()).toEqual(['ann@agency-a.test', 'ben@agency-a.test']);
    expect(sent[0]).toMatchObject({ agencyId: IDS.agencyA, props: { kind: 'service_paused', billingUrl: 'https://app.rm.test/agency/settings/billing' } });
    expect((await rowOf(n!.id)).sentAt).not.toBeNull();
    sent = [];
    await run();
    expect(sent).toHaveLength(0);
  });

  it('marks null-mapped rows sent without mailing', async () => {
    const [a] = await notice('billing_pilot');
    const [b] = await notice('billing_past_due', { reason: 'signal:subscription_ended' });
    await run();
    expect(sent).toHaveLength(0);
    expect((await rowOf(a!.id)).sentAt).not.toBeNull();
    expect((await rowOf(b!.id)).sentAt).not.toBeNull();
  });

  it('marks a row sent when the agency has no admins', async () => {
    await dbs.owner.delete(membership);
    const [n] = await notice('billing_active');
    await run();
    expect(sent).toHaveLength(0);
    expect((await rowOf(n!.id)).sentAt).not.toBeNull();
  });

  it('passes the mapped date through (pause date = pastDueSince + 7 days)', async () => {
    await notice('billing_past_due', { reason: 'timer:trial_ended', pastDueSince: '2026-10-01T00:00:00.000Z' });
    await run();
    expect(sent[0]!.props).toMatchObject({ kind: 'trial_ended', date: '2026-10-08T00:00:00.000Z' });
  });

  it('on failure bumps attempts and records the error, then retries; stops after 5 attempts', async () => {
    const [n] = await notice('billing_active');
    send = async () => {
      throw new Error('boom');
    };
    await run();
    let r = await rowOf(n!.id);
    expect(r).toMatchObject({ sentAt: null, attempts: 1, lastError: 'Error: boom' });
    send = async (to, agencyId, props) => void sent.push({ to, agencyId, props });
    await run();
    r = await rowOf(n!.id);
    expect(r.sentAt).not.toBeNull();
    const [dead] = await notice('billing_active');
    await dbs.owner.update(billingNotice).set({ attempts: 5 }).where(eq(billingNotice.id, dead!.id));
    sent = [];
    await run();
    expect(sent).toHaveLength(0);
    expect((await rowOf(dead!.id)).sentAt).toBeNull();
  });

  it('does not double-send when two runs overlap', async () => {
    await notice('billing_suspended');
    send = async (to, agencyId, props) => {
      await new Promise((r) => setTimeout(r, 100));
      sent.push({ to, agencyId, props });
    };
    await Promise.all([run(), run()]);
    expect(sent.map((s) => s.to).sort()).toEqual(['ann@agency-a.test', 'ben@agency-a.test']);
  });

  it('processes oldest first', async () => {
    await notice('billing_read_only');
    await notice('billing_suspended');
    const order = (await dbs.owner.select({ k: billingNotice.kind }).from(billingNotice).orderBy(asc(billingNotice.createdAt))).map((r) => r.k);
    await run();
    const kinds = [...new Set(sent.map((s) => s.props.kind))];
    expect(kinds).toEqual(order.map((k) => (k === 'billing_read_only' ? 'service_paused' : 'account_suspended')));
  });
});
