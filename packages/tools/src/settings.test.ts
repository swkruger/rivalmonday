import { createAccessContext } from '@cs/core';
import { agency, agencyWebhook, client, contact } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  addClientRecipient, addWebhook, brandingProblems, deactivateRecipient, getAgencyBranding, listClientRecipients, listWebhooks,
  setWebhookActive, updateAgencyBranding, updateClientDeliverySettings,
} from './settings';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const mk = (role: 'agency_admin' | 'account_manager' | 'client_owner', scope: 'all' | string[]) =>
  createAccessContext({ agencyId: IDS.agencyA, userId: role, role, clientScope: scope, features: [] });
const admin = mk('agency_admin', 'all');
const am = mk('account_manager', [IDS.clientA1]);
const owner = mk('client_owner', [IDS.clientA1]);
const NOW = new Date('2026-10-05T12:00:00Z');

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
});

describe('branding', () => {
  it('reports invalid values and stores only trimmed valid ones', async () => {
    expect(brandingProblems({ primary: 'red', logoUrl: 'http://x.co/l.png', displayName: 'x'.repeat(81) })).toHaveLength(3);
    await expect(updateAgencyBranding(dbs.service, admin, { primary: 'javascript:alert(1)' })).rejects.toMatchObject({ code: 'invalid_input' });
    await expect(updateAgencyBranding(dbs.service, admin, { logoUrl: 'http://cdn.acme.co/logo.png' })).rejects.toMatchObject({ code: 'invalid_input' });
    await updateAgencyBranding(dbs.service, admin, { displayName: ' Acme Marketing ', primary: '#123ABC', logoUrl: 'https://cdn.acme.co/logo.png', signOff: '' });
    const { stored, resolved } = await getAgencyBranding(dbs.service, am);
    expect(stored).toEqual({ displayName: 'Acme Marketing', primary: '#123ABC', logoUrl: 'https://cdn.acme.co/logo.png' });
    expect(resolved.primary).toBe('#123ABC');
  });

  it('is admin-only to change', async () => {
    await expect(updateAgencyBranding(dbs.service, am, { displayName: 'X' })).rejects.toMatchObject({ code: 'permission_denied' });
  });

  it('never accepts or stores accent: the global #F5A524 accent is not overridable', async () => {
    await updateAgencyBranding(dbs.service, admin, { accent: '#000000', displayName: 'X' } as never);
    const { stored, resolved } = await getAgencyBranding(dbs.service, admin);
    expect(stored).toEqual({ displayName: 'X' });
    expect('accent' in stored).toBe(false);
    expect(resolved.accent).toBe('#F5A524');
  });
});

describe('webhooks', () => {
  it('adds, lists without the secret URL, and toggles', async () => {
    const id = await addWebhook(dbs.service, admin, { kind: 'slack', url: 'https://hooks.slack.com/services/T/B/secret' });
    const [view] = await listWebhooks(dbs.service, admin);
    expect(view).toMatchObject({ id, kind: 'slack', host: 'hooks.slack.com', active: true });
    expect(JSON.stringify(view)).not.toContain('secret');
    await setWebhookActive(dbs.service, admin, id, false);
    const [row] = await dbs.service.select().from(agencyWebhook).where(eq(agencyWebhook.id, id));
    expect(row!.active).toBe(false);
  });

  it('rejects disallowed URLs and non-admins', async () => {
    await expect(addWebhook(dbs.service, admin, { kind: 'slack', url: 'https://evil.example/hook' })).rejects.toMatchObject({ code: 'invalid_input' });
    await expect(addWebhook(dbs.service, am, { kind: 'slack', url: 'https://hooks.slack.com/services/T/B/x' })).rejects.toMatchObject({ code: 'permission_denied' });
  });
});

describe('client recipients', () => {
  it('lets agency roles with access add, list and deactivate recipients', async () => {
    const id = await addClientRecipient(dbs.service, am, { clientId: IDS.clientA1, email: 'Owner@Biz.co', role: 'client_owner' });
    expect((await listClientRecipients(dbs.service, am, IDS.clientA1)).map((r) => r.email)).toEqual(['Owner@Biz.co']);
    await deactivateRecipient(dbs.service, am, id, NOW);
    const [row] = await dbs.service.select().from(contact).where(eq(contact.id, id));
    expect(row).toMatchObject({ active: false });
    expect(row!.linksRevokedBefore?.toISOString()).toBe(NOW.toISOString());
  });

  it('refuses clients out of scope, client roles, and agency contacts', async () => {
    await expect(addClientRecipient(dbs.service, am, { clientId: IDS.clientA2, email: 'x@b.co', role: 'client_owner' })).rejects.toMatchObject({ code: 'not_found' });
    await expect(listClientRecipients(dbs.service, owner, IDS.clientA1)).rejects.toMatchObject({ code: 'permission_denied' });
    const [ag] = await dbs.service.insert(contact).values({ agencyId: IDS.agencyA, role: 'account_manager', email: 'am@e.co' }).returning();
    await expect(deactivateRecipient(dbs.service, am, ag!.id, NOW)).rejects.toMatchObject({ code: 'not_found' });
  });

  it('rejects a duplicate recipient email, case-insensitively', async () => {
    await addClientRecipient(dbs.service, am, { clientId: IDS.clientA1, email: 'Owner@Biz.co', role: 'client_owner' });
    await expect(addClientRecipient(dbs.service, am, { clientId: IDS.clientA1, email: 'owner@biz.co', role: 'client_viewer' })).rejects.toMatchObject({ code: 'invalid_input' });
  });
});

describe('client delivery', () => {
  it('updates alert mode, auto-send and timezone for agency roles', async () => {
    await updateClientDeliverySettings({ service: dbs.service, app: dbs.app }, am, IDS.clientA1, { alertMode: 'direct', briefAutoSend: true, timezone: 'America/New_York' });
    const [c] = await dbs.service.select().from(client).where(eq(client.id, IDS.clientA1));
    expect(c).toMatchObject({ alertMode: 'direct', briefAutoSend: true, timezone: 'America/New_York' });
    await expect(updateClientDeliverySettings({ service: dbs.service, app: dbs.app }, am, IDS.clientA1, { timezone: 'Nope/Zone' })).rejects.toMatchObject({ code: 'invalid_input' });
    await expect(updateClientDeliverySettings({ service: dbs.service, app: dbs.app }, owner, IDS.clientA1, { alertMode: 'direct' })).rejects.toMatchObject({ code: 'permission_denied' });
  });

  it('rejects a non-IANA abbreviation like EST via validTimezone (mirrors the client table CHECK)', async () => {
    await expect(updateClientDeliverySettings({ service: dbs.service, app: dbs.app }, am, IDS.clientA1, { timezone: 'EST' })).rejects.toMatchObject({ code: 'invalid_input' });
  });
});

it('getAgencyBranding works for agencies with no stored branding', async () => {
  await dbs.owner.update(agency).set({ branding: null }).where(eq(agency.id, IDS.agencyA));
  const { stored, resolved } = await getAgencyBranding(dbs.service, owner);
  expect(stored).toEqual({});
  expect(resolved.displayName).toBe('Agency A');
});
