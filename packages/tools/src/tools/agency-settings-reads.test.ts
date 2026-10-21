import { createAccessContext } from '@cs/core';
import { agency, agencyWebhook, auditLog, contact, invitation, membership, supportSession } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { seedUser, truncateAuth } from '../../test/fixtures';
import { createToolRegistry } from '../registry';
import { getAgencyBranding, listClientRecipients, listWebhooks } from '../settings';
import { listTeam } from '../access/team';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
// Default sink: rows land in `audit_log` (the support-audit assertion reads them back).
const registry = createToolRegistry({ app: dbs.app, service: dbs.service });
const admin = createAccessContext({ agencyId: IDS.agencyA, userId: 'admin', role: 'agency_admin', clientScope: 'all', features: [] });
const am = createAccessContext({ agencyId: IDS.agencyA, userId: 'am', role: 'account_manager', clientScope: [IDS.clientA1], features: [] });
const owner = createAccessContext({ agencyId: IDS.agencyA, userId: 'o', role: 'client_owner', clientScope: [IDS.clientA1], features: [] });
const SESSION = '00000000-0000-4000-8000-0000000005e5';
const support = createAccessContext({
  agencyId: IDS.agencyA, userId: 'op', role: 'agency_admin', clientScope: 'all', features: [],
  support: { sessionId: SESSION, platformUserId: 'op' },
});

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await truncateAuth(dbs.owner);
  await seedTenancy(dbs.owner);
  await seedUser(dbs.owner, 'admin', 'admin@agency.co');
  await dbs.owner.execute(sql`update auth."user" set name = 'Ann <admin@agency.co>' where id = 'admin'`);
  await seedUser(dbs.owner, 'op', 'op@rivalmonday.com');
  await dbs.owner.insert(membership).values({ userId: 'admin', agencyId: IDS.agencyA, role: 'agency_admin', createdBy: 'seed' });
  await dbs.owner.insert(invitation).values({ agencyId: IDS.agencyA, email: 'new@agency.co', role: 'account_manager', invitedBy: 'admin', expiresAt: new Date(Date.now() + 86_400_000) });
  await dbs.owner.update(agency).set({ branding: { displayName: 'Peak', fromEmail: 'briefs@peak.co' } }).where(eq(agency.id, IDS.agencyA));
  await dbs.owner.insert(agencyWebhook).values({ agencyId: IDS.agencyA, kind: 'slack', url: 'https://hooks.slack.com/services/T0/B0/x', createdBy: 'admin' });
  await dbs.owner.insert(contact).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, role: 'client_owner', email: 'owner@client.com', name: 'Owner <owner@client.com>' });
  await dbs.owner.insert(supportSession).values({ id: SESSION, platformUserId: 'op', agencyId: IDS.agencyA, reason: 'checking settings', expiresAt: new Date(Date.now() + 3_600_000) });
});

/** The web reads JSON-cloned output: Dates stay Dates in-process, so compare structurally. */
const same = (a: unknown) => JSON.parse(JSON.stringify(a));

describe('agency settings read tools (7a2 Task 7)', () => {
  it('each new tool returns the service output and masks emails in a support context', async () => {
    expect(same(await registry.invoke(admin, 'get_team', {}))).toEqual(same(await listTeam(dbs.service, admin)));
    expect(same(await registry.invoke(admin, 'get_agency_branding', {}))).toEqual(same(await getAgencyBranding(dbs.service, admin)));
    expect(same(await registry.invoke(admin, 'list_webhooks', {}))).toEqual(same({ items: await listWebhooks(dbs.service, admin) }));
    expect(same(await registry.invoke(admin, 'list_client_recipients', { clientId: IDS.clientA1 }))).toEqual(same({ items: await listClientRecipients(dbs.service, admin, IDS.clientA1) }));

    const team = (await registry.invoke(support, 'get_team', {})) as { members: { email: string; name: string }[]; invitations: { email: string }[] };
    expect(team.members[0]).toMatchObject({ email: 'a•••@agency.co', name: 'Ann <a•••@agency.co>' });
    expect(team.invitations[0]!.email).toBe('n•••@agency.co');
    const branding = (await registry.invoke(support, 'get_agency_branding', {})) as { stored: { fromEmail?: string }; resolved: { fromEmail: string | null } };
    expect(branding.stored.fromEmail).toBe('b•••@peak.co');
    expect(branding.resolved.fromEmail).toBe('b•••@peak.co');
    const rec = (await registry.invoke(support, 'list_client_recipients', { clientId: IDS.clientA1 })) as { items: { email: string; name: string | null }[] };
    expect(rec.items[0]).toMatchObject({ email: 'o•••@client.com', name: 'Owner <o•••@client.com>' });
    expect(JSON.stringify([team, branding, rec])).not.toMatch(/admin@|new@|briefs@|owner@/);
  });

  it('keeps the service functions’ own role checks (refusals stay not_found)', async () => {
    await expect(registry.invoke(owner, 'get_team', {})).rejects.toMatchObject({ code: 'not_found' });
    await expect(registry.invoke(am, 'list_webhooks', {})).rejects.toMatchObject({ code: 'permission_denied' });
    await expect(registry.invoke(am, 'get_agency_branding', {})).rejects.toMatchObject({ code: 'permission_denied' });
    await expect(registry.invoke(am, 'list_client_recipients', { clientId: IDS.clientA2 })).rejects.toMatchObject({ code: 'not_found' });
    expect(((await registry.invoke(am, 'get_team', {})) as { members: unknown[] }).members).toEqual([]);
  });

  it('support context call writes an audit row in the target agency', async () => {
    for (const [tool, input] of [['get_team', {}], ['get_agency_branding', {}], ['list_webhooks', {}], ['list_client_recipients', { clientId: IDS.clientA1 }]] as const) {
      await registry.invoke(support, tool, input);
    }
    const rows = await dbs.owner.select().from(auditLog);
    expect(rows.map((r) => r.tool).sort()).toEqual(['get_agency_branding', 'get_team', 'list_client_recipients', 'list_webhooks']);
    for (const r of rows) expect(r).toMatchObject({ agencyId: IDS.agencyA, userId: 'op', role: 'platform_support', outcome: 'ok', channel: 'web', supportSessionId: SESSION });
  });
});
