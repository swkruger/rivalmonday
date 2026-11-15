import { agency, agencySendingDomain, contact } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { verifyUnsubscribeToken } from '@cs/tools';
import { eq } from 'drizzle-orm';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createWorkerDeps, type WorkerDeps } from './deps';

/** Phase 10 (R12/R21): the worker's lifecycle senders, end to end through the file transport. */
const AGENCY = '0b0e3c8e-4a1f-4c3e-9d7a-2f6b8c1d5e90';
const SECRET = 'worker-test-auth-secret-0123456789abcdefghij';
let dir: string;
let deps: WorkerDeps | null = null;

const make = (extra: Record<string, string> = {}) =>
  (deps = createWorkerDeps({
    APP_URL: 'https://app.rm.test/', EMAIL_FROM: 'hello@rm.test', EMAIL_OUTBOX_DIR: dir, BETTER_AUTH_SECRET: SECRET,
    SERVICE_DATABASE_URL: process.env.TEST_SERVICE_DATABASE_URL ?? 'postgres://unused/cs_x_test', ...extra,
  }));
type Out = { from: string; to: string; replyTo: string | null; subject: string; text: string; tag: string; stream?: string; headers?: { Name: string; Value: string }[] };
const outbox = async (): Promise<(Out & { html: string })[]> => {
  const files = (await readdir(dir)).filter((f) => f.endsWith('.json')).sort();
  return Promise.all(files.map(async (f) => ({ ...(JSON.parse(await readFile(join(dir, f), 'utf8')) as Out), html: await readFile(join(dir, f.replace(/\.json$/, '.html')), 'utf8') })));
};

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'rm-senders-'));
});
afterEach(async () => {
  await deps?.close();
  deps = null;
  await rm(dir, { recursive: true, force: true });
});

describe('billingEmail().sendOnboarding', () => {
  it('welcome and sign-up notice: Rival Monday From, default stream, no headers, support reply-to', async () => {
    const mail = make().billingEmail();
    await mail.sendOnboarding('jo@acme.test', AGENCY, { template: 'agency_welcome', props: { agencyName: 'Acme Agency', url: 'https://app.rm.test/onboarding/start' } });
    await mail.sendOnboarding('ops@rm.test', AGENCY, {
      template: 'platform_signup_notice',
      props: { agencyName: 'Acme Agency', contactName: 'Jo', email: 'jo@acme.test', source: 'open', offer: 'trial', consoleUrl: `https://app.rm.test/platform/agencies/${AGENCY}` },
    });
    const [welcome, notice] = await outbox().then((o) => [o.find((m) => m.tag === 'agency_welcome')!, o.find((m) => m.tag === 'platform_signup_notice')!]);
    for (const m of [welcome!, notice!]) {
      expect(m).toMatchObject({ from: '"Rival Monday" <hello@rm.test>', replyTo: 'support@rivalmonday.app' });
      expect(m.stream).toBeUndefined();
      expect(m.headers).toBeUndefined();
    }
    expect(welcome!.to).toBe('jo@acme.test');
    expect(welcome!.html).toContain('https://app.rm.test/onboarding/start');
    expect(welcome!.text).toContain('Questions or feedback during the pilot? Email support@rivalmonday.app. We read every message.');
    expect(notice!.html).toContain(`https://app.rm.test/platform/agencies/${AGENCY}`);
  });

  it('tip: broadcast stream, one-click List-Unsubscribe headers with a verifiable token, unsubscribe link in the body', async () => {
    const mail = make().billingEmail();
    await mail.sendOnboarding('jo@acme.test', AGENCY, { template: 'onboarding_tip', props: { agencyName: 'Acme Agency', day: 1, nextStep: 'profile', url: 'https://app.rm.test/onboarding/start' } });
    const [m] = await outbox();
    expect(m).toMatchObject({ tag: 'onboarding_tip', stream: 'broadcast', replyTo: 'support@rivalmonday.app' });
    const unsub = m!.headers!.find((h) => h.Name === 'List-Unsubscribe')!.Value;
    const match = /^<https:\/\/app\.rm\.test\/u\/([A-Za-z0-9_-]+)>$/.exec(unsub);
    expect(match).not.toBeNull();
    expect(verifyUnsubscribeToken(match![1]!, SECRET)).toBe(AGENCY);
    expect(m!.headers).toContainEqual({ Name: 'List-Unsubscribe-Post', Value: 'List-Unsubscribe=One-Click' });
    expect(m!.html).toContain(`https://app.rm.test/u/${match![1]}`);
  });

  it('SUPPORT_REPLY_TO overrides the reply-to address', async () => {
    const mail = make({ SUPPORT_REPLY_TO: 'help@agency-ops.test' }).billingEmail();
    await mail.sendOnboarding('jo@acme.test', AGENCY, { template: 'agency_welcome', props: { agencyName: 'A', url: 'https://app.rm.test/onboarding/start' } });
    expect((await outbox())[0]!.replyTo).toBe('help@agency-ops.test');
    expect((await outbox())[0]!.text).toContain('Email help@agency-ops.test. We read every message.');
  });

  it('a tip without BETTER_AUTH_SECRET throws (retried) and sends nothing', async () => {
    const mail = make({ BETTER_AUTH_SECRET: '' }).billingEmail();
    await expect(mail.sendOnboarding('jo@acme.test', AGENCY, { template: 'onboarding_tip', props: { agencyName: 'A', day: 1, nextStep: 'profile', url: 'https://x' } })).rejects.toThrow(/BETTER_AUTH_SECRET/);
    expect(await outbox()).toHaveLength(0);
  });

  it('exposes PLATFORM_ADMIN_EMAILS (normalised) for the sign-up notice recipients', () => {
    expect(make({ PLATFORM_ADMIN_EMAILS: ' Boss@RM.test , ops@rm.test' }).billingEmail().platformAdmins).toEqual(['boss@rm.test', 'ops@rm.test']);
  });
});

describe('billingEmail().sendClient and the other senders (13a1)', () => {
  const dbs = openTestDbs();
  afterAll(() => dbs.closeAll());
  const props = { kind: 'client-payment-needed', actionUrl: 'https://acme.clients.example/x' } as never;
  beforeEach(async () => {
    await truncateAll(dbs.owner);
    await seedTenancy(dbs.owner);
    await dbs.owner.update(agency).set({ hostSlug: 'acme', branding: { displayName: 'Acme Marketing' } }).where(eq(agency.id, IDS.agencyA));
  });
  const withDb = (extra: Record<string, string> = {}) => make({ SERVICE_DATABASE_URL: process.env.TEST_SERVICE_DATABASE_URL!, NEUTRAL_DOMAIN: 'clients.example', ...extra });

  it('client billing notice From is the agency sender', async () => {
    const mail = withDb().billingEmail();
    await mail.sendClient('o@a1.test', IDS.agencyA, IDS.clientA1, { agencyName: 'Agency A', branding: { displayName: 'Acme Marketing' } }, props);
    await dbs.owner.insert(agencySendingDomain).values({ agencyId: IDS.agencyA, domain: 'acme.co', localPart: 'billing', status: 'verified' });
    await mail.sendClient('o@a1.test', IDS.agencyA, IDS.clientA1, { agencyName: 'Agency A', branding: { displayName: 'Acme Marketing' } }, props);
    const sent = (await outbox()).filter((m) => m.tag === 'client_billing_notice').map((m) => m.from).sort();
    expect(sent).toEqual(['"Acme Marketing" <acme@mail.clients.example>', '"Acme Marketing" <billing@acme.co>']);
    for (const f of sent) expect(f).not.toContain('rm.test');
  });

  it('agency-facing billing notices keep the platform sender', async () => {
    await withDb().billingEmail().sendAgencyClient('jo@acme.test', IDS.agencyA, { kind: 'client-payment-failed', clientName: 'A1', actionUrl: 'https://app.rm.test/x' } as never);
    expect((await outbox())[0]!.from).toBe('"Rival Monday" <hello@rm.test>');
  });

  it('domainEmail: platform-branded notice from the platform sender to active agency-admin contacts; failures never throw', async () => {
    await dbs.owner.delete(contact).where(eq(contact.agencyId, IDS.agencyA));
    await dbs.owner.insert(contact).values([
      { agencyId: IDS.agencyA, role: 'agency_admin', email: 'boss@acme.test' },
      { agencyId: IDS.agencyA, role: 'agency_admin', email: 'gone@acme.test', active: false },
      { agencyId: IDS.agencyA, role: 'account_manager', email: 'am@acme.test' },
    ]);
    const d = withDb();
    await d.domainEmail({ agencyId: IDS.agencyA, kind: 'domain_failed', name: 'intel.acme.co', error: "We couldn't verify this domain within 72 hours." });
    const sent = (await outbox()).filter((m) => m.tag === 'agency_domain_notice');
    expect(sent.map((m) => m.to)).toEqual(['boss@acme.test']);
    expect(sent[0]).toMatchObject({ from: '"Rival Monday" <hello@rm.test>', subject: "We couldn't verify intel.acme.co" });
    expect(sent[0]!.html).toContain('href="https://app.rm.test/agency/settings/domains"');
    // No EMAIL_FROM: logged, not thrown.
    await expect(withDb({ EMAIL_FROM: '' }).domainEmail({ agencyId: IDS.agencyA, kind: 'domain_live', name: 'intel.acme.co' })).resolves.toBeUndefined();
  });

  it('leadEmailDeps carries the sender config (platform From + host env)', () => {
    expect(withDb().leadEmailDeps()!.sender).toMatchObject({ platformFrom: 'hello@rm.test', hostEnv: { neutralDomain: 'clients.example' } });
  });
});
