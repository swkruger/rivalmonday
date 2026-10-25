import { agency, agencyOnboarding, type AgencyInviteLinkRow, billingNotice, clientBilling, invitation, membership, type PendingSignupRow, platformAdmin } from '@cs/db';
import { enqueueSignupEmails } from '@cs/tools';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { asc, eq, sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BillingEmailSender, WorkerDeps } from '../deps';
import { createBillingNoticeJobs } from './billing-notices';
import { workerLog } from '../log';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
afterEach(() => vi.restoreAllMocks());

type Sent = { to: string; agencyId: string; props: Parameters<BillingEmailSender['send']>[2] };
let sent: Sent[] = [];
let send: BillingEmailSender['send'];
type SentClient = { to: string; agencyId: string; clientId: string; from: { agencyName: string; branding: unknown }; props: Parameters<BillingEmailSender['sendClient']>[4] };
type SentAgencyClient = { to: string; agencyId: string; props: Parameters<BillingEmailSender['sendAgencyClient']>[2] };
let sentClient: SentClient[] = [];
let sentAgencyClient: SentAgencyClient[] = [];
let clientSend: ((to: string) => Promise<void>) | null = null;
type SentOnboarding = { to: string; agencyId: string; email: Parameters<BillingEmailSender['sendOnboarding']>[2] };
let sentOnboarding: SentOnboarding[] = [];
let onboardingSend: ((to: string) => Promise<void>) | null = null;
const deps = {
  serviceDb: () => dbs.service,
  billingEmail: () => ({
    appUrl: 'https://app.rm.test',
    send: (...a: Parameters<BillingEmailSender['send']>) => send(...a),
    sendClient: async (to: string, agencyId: string, clientId: string, from: SentClient['from'], props: SentClient['props']) => {
      if (clientSend) await clientSend(to);
      sentClient.push({ to, agencyId, clientId, from, props });
    },
    sendAgencyClient: async (to: string, agencyId: string, props: SentAgencyClient['props']) => void sentAgencyClient.push({ to, agencyId, props }),
    platformAdmins: ['env-owner@rm.test'],
    sendOnboarding: async (to: string, agencyId: string, email: SentOnboarding['email']) => {
      if (onboardingSend) await onboardingSend(to);
      sentOnboarding.push({ to, agencyId, email });
    },
  }),
} as unknown as WorkerDeps;
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
  sentClient = [];
  sentAgencyClient = [];
  clientSend = null;
  sentOnboarding = [];
  onboardingSend = null;
  send = async (to, agencyId, props) => void sent.push({ to, agencyId, props });
  vi.spyOn(workerLog, 'info').mockImplementation(() => {});
  vi.spyOn(workerLog, 'warn').mockImplementation(() => {});
});

describe('9b client billing notices', () => {
  const clientNotice = (kind: string, params: Record<string, unknown> = {}) =>
    dbs.owner.insert(billingNotice).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, audience: 'client', kind, params, dedupeKey: `${kind}:${Math.random()}` }).returning({ id: billingNotice.id });
  const agencyNotice = (kind: string, params: Record<string, unknown> = {}) =>
    dbs.owner.insert(billingNotice).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, audience: 'agency', kind, params, dedupeKey: `${kind}:${Math.random()}` }).returning({ id: billingNotice.id });
  const setBilling = (state: string) => dbs.owner.insert(clientBilling).values({ clientId: IDS.clientA1, agencyId: IDS.agencyA, state: state as 'invited' });
  const owner = async (id: string, email: string, role = 'client_owner') => {
    await user(id, email);
    await dbs.owner.insert(membership).values({ userId: id, agencyId: IDS.agencyA, role, clientId: IDS.clientA1, createdBy: 'test' });
  };

  it('client-payment-link goes to every current client owner (not viewers) with agency branding, then drops checkoutUrl', async () => {
    await setBilling('invited');
    await dbs.owner.update(agency).set({ branding: { displayName: 'Acme Comfort' } }).where(eq(agency.id, IDS.agencyA));
    await owner('o1', 'olive@client.test');
    await owner('o2', 'omar@client.test');
    await owner('v1', 'vic@client.test', 'client_viewer');
    const [n] = await clientNotice('client-payment-link', { checkoutUrl: 'https://checkout.stripe.test/c/secret', issuedAt: '2026-10-01T00:00:00.000Z' });
    await run();
    expect(sentClient.map((s) => s.to).sort()).toEqual(['olive@client.test', 'omar@client.test']);
    expect(sentClient[0]).toMatchObject({ agencyId: IDS.agencyA, clientId: IDS.clientA1, props: { kind: 'client-payment-link', actionUrl: 'https://checkout.stripe.test/c/secret' }, from: { branding: { displayName: 'Acme Comfort' } } });
    expect(sent).toHaveLength(0);
    const r = await rowOf(n!.id);
    expect(r.sentAt).not.toBeNull();
    expect(r.params).not.toHaveProperty('checkoutUrl');
    expect(JSON.stringify(r.params)).not.toContain('secret');
  });

  it("payment-link email reaches the pending owner's address", async () => {
    await setBilling('invited');
    await dbs.owner.insert(invitation).values({ agencyId: IDS.agencyA, email: 'Pending@Client.test', role: 'client_owner', clientId: IDS.clientA1, invitedBy: 'a1', expiresAt: new Date(Date.now() + 864e5) });
    await dbs.owner.insert(invitation).values({ agencyId: IDS.agencyA, email: 'gone@client.test', role: 'client_owner', clientId: IDS.clientA1, invitedBy: 'a1', expiresAt: new Date(Date.now() + 864e5), revokedAt: new Date() });
    await clientNotice('client-payment-link', { checkoutUrl: 'https://checkout.stripe.test/c/secret' });
    await run();
    expect(sentClient.map((s) => s.to)).toEqual(['pending@client.test']);
  });

  it('client-payment-needed links to the client billing page', async () => {
    await setBilling('payment_needed');
    await owner('o1', 'olive@client.test');
    await clientNotice('client-payment-needed');
    await run();
    expect(sentClient[0]!.props).toMatchObject({ kind: 'client-payment-needed', actionUrl: `https://app.rm.test/c/${IDS.clientA1}/settings/billing` });
  });

  it('no client owners: row is marked done with a reason, no retry loop, checkoutUrl still dropped', async () => {
    await setBilling('invited');
    const [n] = await clientNotice('client-payment-link', { checkoutUrl: 'https://checkout.stripe.test/c/secret' });
    await run();
    const r = await rowOf(n!.id);
    expect(sentClient).toHaveLength(0);
    expect(r).toMatchObject({ attempts: 0, lastError: 'skipped: no client owners' });
    expect(r.sentAt).not.toBeNull();
    expect(r.params).not.toHaveProperty('checkoutUrl');
  });

  it('disconnected billing: no email, row skipped with a reason', async () => {
    await setBilling('disconnected');
    await owner('o1', 'olive@client.test');
    const [n] = await clientNotice('client-payment-needed');
    await run();
    expect(sentClient).toHaveLength(0);
    const r = await rowOf(n!.id);
    expect(r).toMatchObject({ lastError: 'skipped: billing disconnected' });
    expect(r.sentAt).not.toBeNull();
  });

  it('paused clients still get client-payment-needed', async () => {
    await setBilling('payment_needed');
    await owner('o1', 'olive@client.test');
    await dbs.owner.execute(sql`update client set paused_at = now() where id = ${IDS.clientA1}`);
    await clientNotice('client-payment-needed');
    await run();
    expect(sentClient).toHaveLength(1);
  });

  it('every owner rejecting keeps the row unsent (checkoutUrl kept for retry); one rejecting owner still marks it sent', async () => {
    await setBilling('invited');
    await owner('o1', 'olive@client.test');
    await owner('o2', 'omar@client.test');
    const [n] = await clientNotice('client-payment-link', { checkoutUrl: 'https://checkout.stripe.test/c/x' });
    clientSend = async () => {
      throw new Error('down');
    };
    await run();
    let r = await rowOf(n!.id);
    expect(r).toMatchObject({ sentAt: null, attempts: 1, lastError: 'Error: down' });
    expect(r.params).toHaveProperty('checkoutUrl');
    clientSend = async (to) => {
      if (to === 'olive@client.test') throw new Error('bad address');
    };
    await run();
    r = await rowOf(n!.id);
    expect(sentClient.map((s) => s.to)).toEqual(['omar@client.test']);
    expect(r.sentAt).not.toBeNull();
  });

  it('agency 9b kinds go to agency admins only, with client name (looked up when absent) and n', async () => {
    await agencyNotice('client-payment-failed');
    await agencyNotice('client-auto-paused', { clientName: 'Smith HVAC', n: 14 });
    await agencyNotice('client-paid');
    await run();
    expect(sent).toHaveLength(0);
    expect(sentClient).toHaveLength(0);
    const byKind = new Map<string, SentAgencyClient[]>();
    for (const s of sentAgencyClient) byKind.set(s.props.kind, [...(byKind.get(s.props.kind) ?? []), s]);
    expect([...byKind.keys()].sort()).toEqual(['client-auto-paused', 'client-paid', 'client-payment-failed']);
    expect(byKind.get('client-auto-paused')!.map((s) => s.to).sort()).toEqual(['ann@agency-a.test', 'ben@agency-a.test']);
    expect(byKind.get('client-auto-paused')![0]!.props).toMatchObject({ clientName: 'Smith HVAC', n: 14, billingUrl: 'https://app.rm.test/agency/settings/billing' });
    const [c] = await dbs.owner.execute<{ name: string }>(sql`select name from client where id = ${IDS.clientA1}`);
    expect(byKind.get('client-paid')![0]!.props.clientName).toBe(c!.name);
    const left = await dbs.owner.select().from(billingNotice).where(sql`sent_at is null`);
    expect(left).toHaveLength(0);
  });
});

describe('7b1 client_spend_paused agency notice', () => {
  it('goes to agency admins only, with the client, the resume date and the usage page', async () => {
    await dbs.owner.insert(billingNotice).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, audience: 'agency', kind: 'client_spend_paused', params: { clientName: 'Smith HVAC', until: 'November 1' }, dedupeKey: 'spend_paused:x:2026-10' });
    await run();
    expect(sentClient).toHaveLength(0);
    expect(sentAgencyClient.map((s) => s.to).sort()).toEqual(['ann@agency-a.test', 'ben@agency-a.test']);
    expect(sentAgencyClient[0]!.props).toMatchObject({ kind: 'client_spend_paused', clientName: 'Smith HVAC', until: 'November 1', billingUrl: 'https://app.rm.test/agency/settings/usage' });
    expect(await dbs.owner.select().from(billingNotice).where(sql`sent_at is null`)).toHaveLength(0);
  });
});

describe('7b2 client-duplicate-subscription agency notice', () => {
  it('delivers client-duplicate-subscription to agency admins with the client name', async () => {
    await dbs.owner.insert(billingNotice).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, audience: 'agency', kind: 'client-duplicate-subscription', params: {}, dedupeKey: 'client-duplicate-subscription:x:sub_2' });
    await run();
    expect(sentClient).toHaveLength(0);
    expect(sentAgencyClient.map((s) => s.to).sort()).toEqual(['ann@agency-a.test', 'ben@agency-a.test']);
    const [c] = await dbs.owner.execute<{ name: string }>(sql`select name from client where id = ${IDS.clientA1}`);
    expect(sentAgencyClient[0]!.props).toMatchObject({ kind: 'client-duplicate-subscription', clientName: c!.name, billingUrl: 'https://app.rm.test/agency/settings/billing' });
    expect(await dbs.owner.select().from(billingNotice).where(sql`sent_at is null`)).toHaveLength(0);
  });
});

describe('Phase 10 onboarding kinds (R5)', () => {
  const pending = (over: Partial<PendingSignupRow> = {}) =>
    ({ agencyName: 'Acme Agency', contactName: 'Jo Smith', email: 'jo@acme.test', source: 'open', ...over }) as PendingSignupRow;
  const enqueue = (p = pending(), link: AgencyInviteLinkRow | null = null) =>
    dbs.owner.transaction((tx) => enqueueSignupEmails(tx as never, IDS.agencyA, p, new Date(), link));
  const operators = async () => {
    await user('po', 'Plat-Owner@rm.test');
    await user('ps', 'plat-staff@rm.test');
    await user('pv', 'plat-viewer@rm.test');
    await dbs.owner.insert(platformAdmin).values([{ userId: 'po', role: 'owner' }, { userId: 'ps', role: 'staff' }, { userId: 'pv', role: 'viewer' }]);
  };
  const tip = (params: Record<string, unknown>) => notice('onboarding_tip', params, `onboarding_tip:${IDS.agencyA}:${String(params.day)}`);
  const onboarding = (unsubscribedAt: Date | null = null) => dbs.owner.insert(agencyOnboarding).values({ agencyId: IDS.agencyA, source: 'open', unsubscribedAt });
  const byTemplate = (t: string) => sentOnboarding.filter((s) => s.email.template === t);

  it('sign-up completion enqueues exactly two rows; welcome goes to the agency admins, the notice to owner|staff operators + env', async () => {
    await operators();
    await enqueue();
    await enqueue(); // idempotent per agency
    const rows = await dbs.owner.select().from(billingNotice);
    expect(rows.map((r) => r.kind).sort()).toEqual(['agency_welcome', 'platform_signup_notice']);
    await run();
    const welcome = byTemplate('agency_welcome');
    expect(welcome.map((s) => s.to).sort()).toEqual(['ann@agency-a.test', 'ben@agency-a.test']);
    expect(welcome[0]).toMatchObject({ agencyId: IDS.agencyA, email: { props: { agencyName: 'Acme Agency', url: 'https://app.rm.test/onboarding/start' } } });
    const notices = byTemplate('platform_signup_notice');
    expect(notices.map((s) => s.to).sort()).toEqual(['env-owner@rm.test', 'plat-owner@rm.test', 'plat-staff@rm.test']);
    expect(notices[0]!.email.props).toEqual({
      agencyName: 'Acme Agency', contactName: 'Jo Smith', email: 'jo@acme.test', source: 'open', offer: 'trial',
      consoleUrl: `https://app.rm.test/platform/agencies/${IDS.agencyA}`,
    });
    expect(sent).toHaveLength(0);
    expect(sentAgencyClient).toHaveLength(0);
    const left = await dbs.owner.select().from(billingNotice).where(sql`sent_at is null or last_error is not null`);
    expect(left).toHaveLength(0);
  });

  it('pilot invite: the notice carries pilotEndsAt; a null contact name passes through', async () => {
    const link = { offer: 'pilot', pilotEndsAt: new Date('2026-12-01T00:00:00.000Z') } as AgencyInviteLinkRow;
    await enqueue(pending({ source: 'invite', contactName: null }), link);
    await run();
    expect(byTemplate('platform_signup_notice')[0]!.email.props).toMatchObject({ source: 'invite', offer: 'pilot', contactName: null, pilotEndsAt: '2026-12-01T00:00:00.000Z' });
  });

  it('onboarding_tip goes to the agency admins with day, next step and the onboarding URL', async () => {
    await onboarding();
    const [n] = await tip({ day: 3, nextStep: 'team' });
    await run();
    const tips = byTemplate('onboarding_tip');
    expect(tips.map((s) => s.to).sort()).toEqual(['ann@agency-a.test', 'ben@agency-a.test']);
    const [ag] = await dbs.owner.select({ name: agency.name }).from(agency).where(eq(agency.id, IDS.agencyA));
    expect(tips[0]!.email.props).toEqual({ agencyName: ag!.name, day: 3, nextStep: 'team', url: 'https://app.rm.test/onboarding/start' });
    expect(await rowOf(n!.id)).toMatchObject({ lastError: null });
  });

  it('onboarding_tip is skipped (not mailed) once the agency unsubscribed', async () => {
    await onboarding(new Date());
    const [a] = await tip({ day: 1, nextStep: 'profile' });
    await run();
    expect(sentOnboarding).toHaveLength(0);
    const r = await rowOf(a!.id);
    expect(r).toMatchObject({ lastError: 'skipped: unsubscribed', attempts: 0 });
    expect(r.sentAt).not.toBeNull();
  });

  it.each([
    ['completed', { completedAt: new Date() }],
    ['dismissed', { dismissedAt: new Date() }],
  ])('onboarding_tip is skipped when onboarding is %s at send time', async (_n, over) => {
    await dbs.owner.insert(agencyOnboarding).values({ agencyId: IDS.agencyA, source: 'open', ...over });
    const [a] = await tip({ day: 3, nextStep: 'team' });
    await run();
    expect(sentOnboarding).toHaveLength(0);
    expect(await rowOf(a!.id)).toMatchObject({ lastError: 'skipped: onboarding closed', attempts: 0 });
  });

  it('onboarding_tip is skipped when the onboarding row is missing', async () => {
    const [a] = await tip({ day: 3, nextStep: 'team' });
    await run();
    expect(sentOnboarding).toHaveLength(0);
    expect(await rowOf(a!.id)).toMatchObject({ lastError: 'skipped: onboarding closed' });
  });

  it('onboarding_tip with malformed params is skipped with a reason', async () => {
    await onboarding();
    const [b] = await notice('onboarding_tip', { day: 2, nextStep: 'profile' });
    const [c] = await notice('onboarding_tip', { day: 7, nextStep: 'nope' });
    await run();
    expect(sentOnboarding).toHaveLength(0);
    for (const r of [b!, c!]) expect(await rowOf(r.id)).toMatchObject({ lastError: 'skipped: bad params', attempts: 0 });
  });

  it('a notice with no platform operators is marked done with a reason', async () => {
    const mail = deps.billingEmail();
    const noOps = { ...deps, billingEmail: () => ({ ...mail, platformAdmins: [] }) } as unknown as WorkerDeps;
    const [n] = await notice('platform_signup_notice', { agencyName: 'A', contactName: 'B', email: 'b@a.test', source: 'open', offer: 'trial', pilotEndsAt: null });
    await createBillingNoticeJobs(noOps, { envName: 'dev' }).notices.handler({});
    expect(sentOnboarding).toHaveLength(0);
    expect(await rowOf(n!.id)).toMatchObject({ lastError: 'skipped: no platform operators' });
  });

  it('every send rejecting keeps the rows unsent for retry', async () => {
    await enqueue();
    onboardingSend = async () => {
      throw new Error('down');
    };
    await run();
    const rows = await dbs.owner.select().from(billingNotice);
    expect(rows.every((r) => r.sentAt === null && r.attempts === 1)).toBe(true);
  });

  it('unknown kinds are still marked sent without mail', async () => {
    const [n] = await notice('some_future_kind');
    await run();
    expect(sentOnboarding).toHaveLength(0);
    expect((await rowOf(n!.id)).sentAt).not.toBeNull();
  });
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

  it('one rejecting admin address does not re-mail the others: row marked sent, other admin mailed once', async () => {
    const [n] = await notice('billing_active');
    send = async (to, agencyId, props) => {
      if (to === 'ann@agency-a.test') throw new Error('inactive recipient');
      sent.push({ to, agencyId, props });
    };
    await run();
    await run();
    expect(sent.map((s) => s.to)).toEqual(['ben@agency-a.test']);
    expect(await rowOf(n!.id)).toMatchObject({ attempts: 0 });
    expect((await rowOf(n!.id)).sentAt).not.toBeNull();
  });

  it('when every send rejects the row stays unsent with attempts + 1', async () => {
    const [n] = await notice('billing_active');
    send = async () => {
      throw new Error('down');
    };
    await run();
    expect(await rowOf(n!.id)).toMatchObject({ sentAt: null, attempts: 1, lastError: 'Error: down' });
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
