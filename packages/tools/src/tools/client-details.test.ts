import { createHash } from 'node:crypto';
import { type AccessContext, createAccessContext } from '@cs/core';
import { client, contact } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createToolRegistry } from '../registry';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const objects = new Map<string, { body: Uint8Array; contentType: string }>();
const evidenceStore = {
  get: async (k: string) => objects.get(k)?.body ?? null,
  put: async (k: string, body: Uint8Array, contentType: string, opts?: { overwrite?: boolean }) => {
    if (!opts?.overwrite && objects.has(k)) throw Object.assign(new Error('object already exists'), { code: 'object_exists' });
    objects.set(k, { body, contentType });
  },
};
const APP = 'https://app.example';
const registry = createToolRegistry({ app: dbs.app, service: dbs.service, evidenceStore, appUrl: APP }, { audit: { record: async () => {} } });
const ctx = (role: AccessContext['role'], scope: AccessContext['clientScope'], agencyId: string = IDS.agencyA) =>
  createAccessContext({ agencyId, userId: `u-${role}`, role, clientScope: scope, features: [] });
const admin = ctx('agency_admin', 'all');
const amA2 = ctx('account_manager', [IDS.clientA2]);
const viewer = ctx('client_viewer', [IDS.clientA1]);
const owner = ctx('client_owner', [IDS.clientA1]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const sha = createHash('sha256').update(PNG).digest('hex');
const logoIn = { clientId: IDS.clientA1, png: Buffer.from(PNG).toString('base64'), sha256: sha };
const ADDRESS = { line1: '12 Peachtree St', city: 'Atlanta', region: 'GA', postalCode: '30303', country: 'US' as const };

beforeEach(async () => {
  objects.clear();
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
  await dbs.owner.update(client).set({ phone: '(404) 555-0100', address: ADDRESS }).where(eq(client.id, IDS.clientA1));
  await dbs.owner.insert(contact).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, role: 'client_owner', email: 'pat@example.com', name: 'Pat', active: false });
});

describe('client details tools', () => {
  it('update_client_details partial update keeps other fields', async () => {
    await registry.invoke(admin, 'update_client_details', { clientId: IDS.clientA1, phone: '(404) 555-0199' });
    const [row] = await dbs.owner.select().from(client).where(eq(client.id, IDS.clientA1));
    expect(row).toMatchObject({ phone: '(404) 555-0199', address: ADDRESS });
    await registry.invoke(admin, 'update_client_details', { clientId: IDS.clientA1, address: null, contactName: 'Patricia' });
    const [row2] = await dbs.owner.select().from(client).where(eq(client.id, IDS.clientA1));
    expect(row2).toMatchObject({ phone: '(404) 555-0199', address: null });
    expect(await registry.invoke(admin, 'get_client_details', { clientId: IDS.clientA1 })).toMatchObject({ contactName: 'Patricia', contactEmail: 'pat@example.com', phone: '(404) 555-0199' });
  });

  it('update_client_details with a new email adds the owner contact', async () => {
    await registry.invoke(admin, 'update_client_details', { clientId: IDS.clientA1, contactEmail: 'New@Example.com', contactName: 'Newbie' });
    const rows = await dbs.owner.select().from(contact).where(eq(contact.clientId, IDS.clientA1));
    expect(rows.map((r) => r.email).sort()).toEqual(['new@example.com', 'pat@example.com']);
  });

  it('get_client_details returns the new owner email after update', async () => {
    await registry.invoke(admin, 'update_client_details', { clientId: IDS.clientA1, contactEmail: 'New@Example.com', contactName: 'Newbie' });
    expect(await registry.invoke(admin, 'get_client_details', { clientId: IDS.clientA1 })).toMatchObject({ contactEmail: 'new@example.com', contactName: 'Newbie' });
    // Switching back reuses the old row, which becomes the current one again.
    await registry.invoke(admin, 'update_client_details', { clientId: IDS.clientA1, contactEmail: 'pat@example.com' });
    expect(await registry.invoke(admin, 'get_client_details', { clientId: IDS.clientA1 })).toMatchObject({ contactEmail: 'pat@example.com' });
  });

  it('client viewer cannot update details', async () => {
    for (const who of [viewer, owner]) {
      await expect(registry.invoke(who, 'update_client_details', { clientId: IDS.clientA1, phone: '(404) 555-0111' })).rejects.toMatchObject({ code: 'not_found' });
      await expect(registry.invoke(who, 'upload_client_logo', logoIn)).rejects.toMatchObject({ code: 'not_found' });
      await expect(registry.invoke(who, 'get_client_details', { clientId: IDS.clientA1 })).rejects.toMatchObject({ code: 'not_found' });
    }
    await expect(registry.invoke(amA2, 'update_client_details', { clientId: IDS.clientA1, name: 'x' })).rejects.toMatchObject({ code: 'not_found' });
    await expect(registry.invoke(ctx('agency_admin', 'all', IDS.agencyB), 'update_client_details', { clientId: IDS.clientA1, name: 'x' })).rejects.toMatchObject({ code: 'not_found' });
    expect((await dbs.owner.select().from(client).where(eq(client.id, IDS.clientA1)))[0]!.phone).toBe('(404) 555-0100');
  });

  it('upload_client_logo stores content-addressed and is idempotent', async () => {
    const url = `${APP}/files/logo/clients/${IDS.clientA1}/${sha}.png`;
    expect(await registry.invoke(admin, 'upload_client_logo', logoIn)).toEqual({ logoUrl: url });
    expect(await registry.invoke(admin, 'upload_client_logo', logoIn)).toEqual({ logoUrl: url });
    expect(objects.get(`logos/clients/${IDS.clientA1}/${sha}.png`)).toMatchObject({ contentType: 'image/png' });
    expect((await dbs.owner.select().from(client).where(eq(client.id, IDS.clientA1)))[0]!.logoUrl).toBe(url);
  });

  it('upload_client_logo refuses non-PNG bytes and a wrong checksum', async () => {
    const junk = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    await expect(registry.invoke(admin, 'upload_client_logo', { ...logoIn, png: Buffer.from(junk).toString('base64'), sha256: createHash('sha256').update(junk).digest('hex') })).rejects.toMatchObject({ code: 'invalid_input' });
    await expect(registry.invoke(admin, 'upload_client_logo', { ...logoIn, sha256: 'ab'.repeat(32) })).rejects.toMatchObject({ code: 'invalid_input' });
    expect(objects.size).toBe(0);
  });
});
