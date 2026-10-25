import { agency } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { createMemoryTransport } from '@cs/email';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { seedUser, truncateAuth } from '../../test/fixtures';
import type { ToolDeps } from '../deps';
import { sendTeamInviteEmail } from './team-invite-email';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());

describe('sendTeamInviteEmail inviter', () => {
  let transport: ReturnType<typeof createMemoryTransport>;
  const deps = (): ToolDeps => ({ app: dbs.app, service: dbs.service, leadEmail: { transport, appUrl: 'https://app.test/', fromAddress: 'team@app.test', platformAdmins: [] } });
  const expiresAt = new Date('2026-11-01T00:00:00Z');

  beforeEach(async () => {
    transport = createMemoryTransport();
    await truncateAll(dbs.owner);
    await truncateAuth(dbs.owner);
    await seedTenancy(dbs.owner);
    await seedUser(dbs.owner, 'admin', 'admin@e.co');
    await dbs.owner.execute(sql`update auth."user" set name = 'Pat Lee' where id = 'admin'`);
    await dbs.owner.update(agency).set({ branding: { displayName: 'Peak Digital' } }).where(eq(agency.id, IDS.agencyA));
  });

  it('{ userId } names the inviter and sets replyTo (unchanged)', async () => {
    expect(await sendTeamInviteEmail(deps(), { agencyId: IDS.agencyA, to: 'n@e.co', role: 'agency_admin', inviter: { userId: 'admin' }, expiresAt })).toBe(true);
    expect(transport.sent[0]).toMatchObject({ subject: 'Pat Lee invited you to Peak Digital', replyTo: 'admin@e.co' });
  });

  it('{ agency: true } names the agency display name, no replyTo', async () => {
    expect(await sendTeamInviteEmail(deps(), { agencyId: IDS.agencyA, to: 'n@e.co', role: 'agency_admin', inviter: { agency: true }, expiresAt })).toBe(true);
    const m = transport.sent[0]!;
    expect(m.subject).toBe('Peak Digital invited you to Peak Digital');
    expect(m.replyTo ?? null).toBeNull();
    expect(m.text).not.toContain('Pat Lee');
    expect(m.text).not.toContain('admin@e.co');
  });
});
