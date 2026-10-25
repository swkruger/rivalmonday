import { DEFAULT_SUPPORT_EMAIL } from '@cs/core';
import { agency, membership } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { createMemoryTransport } from '@cs/email';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { seedUser, truncateAuth } from '../../test/fixtures';
import type { ToolDeps } from '../deps';
import { sendAgencyHoldEmail } from './hold-email';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());

const A = IDS.agencyA;
const REASON = 'Unpaid invoice INV-SECRET-42';
let transport: ReturnType<typeof createMemoryTransport>;
const deps = (o: Partial<ToolDeps> = {}): ToolDeps => ({
  app: dbs.app, service: dbs.service,
  leadEmail: { transport, appUrl: 'https://app.test/', fromAddress: 'team@app.test', platformAdmins: [] },
  ...o,
});

beforeEach(async () => {
  vi.restoreAllMocks();
  transport = createMemoryTransport();
  await truncateAll(dbs.owner);
  await truncateAuth(dbs.owner);
  await seedTenancy(dbs.owner);
  await seedUser(dbs.owner, 'ann', 'Ann@Example.com');
  await seedUser(dbs.owner, 'bob', 'bob@example.com');
  await seedUser(dbs.owner, 'am', 'am@example.com');
  await seedUser(dbs.owner, 'co', 'co@example.com');
  await dbs.owner.execute(sql`update auth."user" set name = 'Ann Admin' where id = 'ann'`);
  await dbs.owner.update(agency).set({ name: 'Peak Digital', suspendedAt: new Date(), suspendedReason: REASON, suspendedBy: 'staff' }).where(eq(agency.id, A));
  await dbs.service.insert(membership).values([
    { userId: 'ann', agencyId: A, role: 'agency_admin', createdBy: 'seed' },
    { userId: 'bob', agencyId: A, role: 'agency_admin', createdBy: 'seed' },
    { userId: 'am', agencyId: A, role: 'account_manager', createdBy: 'seed' },
    { userId: 'co', agencyId: A, role: 'client_owner', clientId: IDS.clientA1, createdBy: 'seed' },
    { userId: 'ann', agencyId: IDS.agencyB, role: 'agency_admin', createdBy: 'seed' },
  ]);
});

describe('sendAgencyHoldEmail', () => {
  it('started: one email per agency admin, Rival Monday from, support Reply-To, never the reason', async () => {
    expect(await sendAgencyHoldEmail(deps(), A, 'started')).toBe(2);
    expect(transport.sent.map((m) => m.to).sort()).toEqual(['ann@example.com', 'bob@example.com']);
    for (const m of transport.sent) {
      expect(m).toMatchObject({ from: '"Rival Monday" <team@app.test>', replyTo: DEFAULT_SUPPORT_EMAIL, subject: 'Your Peak Digital account is on hold', tag: 'agency_hold' });
      expect(m.text).toContain(`contact ${DEFAULT_SUPPORT_EMAIL}.`);
      expect(m.text).not.toContain('INV-SECRET-42');
      expect(m.html).not.toContain('INV-SECRET-42');
    }
    expect(transport.sent.find((m) => m.to === 'ann@example.com')!.text).toContain('Hi Ann,');
  });

  it('lifted uses the lifted subject; a configured support address is the Reply-To and in the copy', async () => {
    expect(await sendAgencyHoldEmail(deps({ supportEmail: 'help@agency.test' }), A, 'lifted')).toBe(2);
    expect(transport.sent[0]).toMatchObject({ replyTo: 'help@agency.test', subject: 'Your Peak Digital account is active again' });
    expect((await sendAgencyHoldEmail(deps({ supportEmail: 'help@agency.test' }), A, 'started'))).toBe(2);
    expect(transport.sent[2]!.text).toContain('contact help@agency.test.');
  });

  it('no transport → 0, nothing sent', async () => {
    expect(await sendAgencyHoldEmail(deps({ leadEmail: null }), A, 'started')).toBe(0);
  });

  it('never throws; a failing send counts only the delivered ones and logs no address', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    let n = 0;
    const flaky = { kind: 'memory' as const, send: async () => { if (n++ === 0) throw new Error('boom ann@example.com'); return { providerId: 'x' }; } };
    expect(await sendAgencyHoldEmail(deps({ leadEmail: { transport: flaky, appUrl: 'https://app.test/', fromAddress: 'team@app.test', platformAdmins: [] } }), A, 'started')).toBe(1);
    const logged = JSON.stringify(err.mock.calls);
    expect(logged).toContain(A);
    expect(logged).not.toMatch(/@example\.com|boom|INV-SECRET/);
    const broken = { ...deps(), service: { execute: async () => { throw new Error('db down'); } } as unknown as ToolDeps['service'] };
    expect(await sendAgencyHoldEmail(broken, A, 'started')).toBe(0);
  });
});
