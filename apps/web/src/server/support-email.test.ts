import { agency, membership, supportSession } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { createMemoryTransport, type EmailTransport } from '@cs/email';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { sendSupportSessionStartedEmailWith } from './support-email';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());

const REASON = 'Checking the brief setup';
let sessionId = '';

async function user(id: string, name: string, email: string) {
  await dbs.owner.execute(sql`insert into auth."user" (id, name, email, "emailVerified") values (${id}, ${name}, ${email}, true)`);
}

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await dbs.owner.execute(sql`truncate auth."user" cascade`);
  await seedTenancy(dbs.owner);
  await user('op', 'Pat Platform', 'pat@rivalmonday.test');
  await user('a1', 'Ann Admin', 'ann@agency-a.test');
  await user('a2', 'ben@agency-a.test', 'ben@agency-a.test');
  await user('m1', 'Mia Manager', 'mia@agency-a.test');
  await dbs.owner.insert(membership).values([
    { userId: 'a1', agencyId: IDS.agencyA, role: 'agency_admin', createdBy: 'test' },
    { userId: 'a2', agencyId: IDS.agencyA, role: 'agency_admin', createdBy: 'test' },
    { userId: 'm1', agencyId: IDS.agencyA, role: 'account_manager', createdBy: 'test' },
  ]);
  const [s] = await dbs.owner
    .insert(supportSession)
    .values({ platformUserId: 'op', agencyId: IDS.agencyA, reason: REASON, startedAt: new Date('2026-10-13T10:00:00Z'), expiresAt: new Date('2026-10-13T11:00:00Z') })
    .returning({ id: supportSession.id });
  sessionId = s!.id;
});

const run = (transport: EmailTransport) => sendSupportSessionStartedEmailWith({ service: dbs.service, transport, from: 'briefs@rivalmonday.test' }, sessionId);

describe('sendSupportSessionStartedEmail', () => {
  it('sends nothing while notify_support_access is off', async () => {
    const t = createMemoryTransport();
    await run(t);
    expect(t.sent).toHaveLength(0);
  });

  it('sends one email per agency admin (not other roles) with the binding copy', async () => {
    await dbs.owner.update(agency).set({ notifySupportAccess: true }).where(eq(agency.id, IDS.agencyA));
    const t = createMemoryTransport();
    await run(t);
    expect(t.sent.map((m) => m.to).sort()).toEqual(['ann@agency-a.test', 'ben@agency-a.test']);
    const m = t.sent[0]!;
    expect(m.subject).toBe('Rival Monday support opened a read-only session');
    expect(m.from).toBe('briefs@rivalmonday.test');
    expect(m.text).toContain("Pat Platform opened a read-only session on October 13, 2026. Reason: Checking the brief setup. They can't change anything. Questions? Reply to this email.");
    expect(m.text).toContain('Hi Ann,');
    expect(t.sent[1]!.text).toContain('Hi,');
  });

  it('never throws when the transport fails, and logs no address or reason', async () => {
    await dbs.owner.update(agency).set({ notifySupportAccess: true }).where(eq(agency.id, IDS.agencyA));
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const failing: EmailTransport = { kind: 'memory', send: async () => { throw new Error('boom ann@agency-a.test'); } };
    await expect(run(failing)).resolves.toBeUndefined();
    expect(log).toHaveBeenCalled();
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/agency-a\.test|Checking the brief/);
    log.mockRestore();
  });

  it('does nothing for an unknown session', async () => {
    const t = createMemoryTransport();
    await expect(sendSupportSessionStartedEmailWith({ service: dbs.service, transport: t, from: 'x@y.test' }, '00000000-0000-4000-8000-00000000ffff')).resolves.toBeUndefined();
    expect(t.sent).toHaveLength(0);
  });
});
