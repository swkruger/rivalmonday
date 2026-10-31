import { createHash } from 'node:crypto';
import { fakeGateway } from '@cs/billing';
import { createAccessContext } from '@cs/core';
import { agencyBilling, plan } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { seedUser, truncateAuth } from '../../test/fixtures';
import { createToolRegistry } from '../registry';
import { avatarUrlOf } from './my-profile';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const objects = new Map<string, Uint8Array>();
let failDelete = false;
const deleted: string[] = [];
const evidenceStore = {
  get: async (k: string) => objects.get(k) ?? null,
  put: async (k: string, body: Uint8Array, _ct: string, opts?: { overwrite?: boolean }) => {
    if (!opts?.overwrite && objects.has(k)) throw Object.assign(new Error('object already exists'), { code: 'object_exists' });
    objects.set(k, body);
  },
  delete: async (k: string) => {
    if (failDelete) throw new Error('r2 down');
    deleted.push(k);
    objects.delete(k);
  },
};
const registry = createToolRegistry({ app: dbs.app, service: dbs.service, evidenceStore, billing: fakeGateway() }, { audit: { record: async () => {} } });
const noStore = createToolRegistry({ app: dbs.app, service: dbs.service }, { audit: { record: async () => {} } });
const mk = (userId: string, extra: Partial<Parameters<typeof createAccessContext>[0]> = {}) =>
  createAccessContext({ agencyId: IDS.agencyA, userId, role: 'agency_admin', clientScope: 'all', features: [], ...extra });
const me = mk('u1');
const guest = mk('contact:00000000-0000-4000-8000-000000000001');
const support = mk('u1', { support: { sessionId: '00000000-0000-4000-8000-0000000000aa', platformUserId: 'op' } });

const png = (n: number) => new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, n]);
const shaOf = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
const upload = (n: number, who = me, reg = registry) => reg.invoke(who, 'upload_my_avatar', { png: Buffer.from(png(n)).toString('base64'), sha256: shaOf(png(n)) });
const pathOf = (userId: string, n: number) => `/files/avatar/${userId}/${shaOf(png(n))}.png`;
const keyOf = (userId: string, n: number) => `avatars/${userId}/${shaOf(png(n))}.png`;
const imageOf = async (id = 'u1') => [...(await dbs.owner.execute<{ image: string | null }>(sql`select image from auth."user" where id = ${id}`))][0]!.image;
const setImage = (image: string | null, id = 'u1') => dbs.owner.execute(sql`update auth."user" set image = ${image} where id = ${id}`);
const nameOf = async (id = 'u1') => [...(await dbs.owner.execute<{ name: string }>(sql`select name from auth."user" where id = ${id}`))][0]!.name;

beforeEach(async () => {
  objects.clear();
  deleted.length = 0;
  failDelete = false;
  await truncateAll(dbs.owner);
  await truncateAuth(dbs.owner);
  await seedTenancy(dbs.owner);
  await seedUser(dbs.owner, 'u1', 'u1@e.co');
  await seedUser(dbs.owner, 'u2', 'u2@e.co');
});

describe('personal profile tools', () => {
  it('avatarUrlOf keeps only uploaded avatar paths', () => {
    expect(avatarUrlOf('/files/avatar/u/x.png')).toBe('/files/avatar/u/x.png');
    expect(avatarUrlOf('https://lh3.googleusercontent.com/a')).toBeNull();
    expect(avatarUrlOf(null)).toBeNull();
  });

  it('get_my_profile hides a foreign Google URL', async () => {
    await setImage('https://lh3.googleusercontent.com/a/x');
    expect(await registry.invoke(me, 'get_my_profile', {})).toEqual({ name: 'u1@e.co', email: 'u1@e.co', avatarUrl: null });
    await setImage(pathOf('u1', 1));
    expect(await registry.invoke(me, 'get_my_profile', {})).toMatchObject({ avatarUrl: pathOf('u1', 1) });
  });

  it('get_my_notification_settings wraps the own-contacts list', async () => {
    expect(await registry.invoke(me, 'get_my_notification_settings', {})).toEqual({ lists: [] });
  });

  it('update_my_profile trims and saves', async () => {
    expect(await registry.invoke(me, 'update_my_profile', { name: '  Pat Lee  ' })).toEqual({ ok: true });
    expect(await nameOf()).toBe('Pat Lee');
    expect(await nameOf('u2')).toBe('u2@e.co');
  });

  it('update_my_profile refuses a bad name with exactly one plain message', async () => {
    const cases: [string, string][] = [
      ['', 'Enter your name.'],
      ['   ', 'Enter your name.'],
      ['a\nb', 'Enter a name without line breaks.'],
      ['a\u0000b', 'Enter a name without line breaks.'],
      ['a\u007fb', 'Enter a name without line breaks.'],
      ['x'.repeat(81), 'Use 80 characters or fewer.'],
    ];
    for (const [name, message] of cases) {
      await expect(registry.invoke(me, 'update_my_profile', { name }), JSON.stringify(name)).rejects.toMatchObject({ code: 'invalid_input', message });
    }
    expect(await nameOf()).toBe('u1@e.co');
    expect(await registry.invoke(me, 'update_my_profile', { name: `  ${'x'.repeat(80)}  ` })).toEqual({ ok: true });
    expect(await nameOf()).toBe('x'.repeat(80));
  });

  it('upload stores and returns the path', async () => {
    expect(await upload(1)).toEqual({ avatarUrl: pathOf('u1', 1) });
    expect(objects.has(keyOf('u1', 1))).toBe(true);
    expect(await imageOf()).toBe(pathOf('u1', 1));
  });

  it('upload rejects non-PNG and a checksum mismatch', async () => {
    const junk = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    await expect(registry.invoke(me, 'upload_my_avatar', { png: Buffer.from(junk).toString('base64'), sha256: shaOf(junk) })).rejects.toMatchObject({ code: 'invalid_input' });
    await expect(registry.invoke(me, 'upload_my_avatar', { png: Buffer.from(png(1)).toString('base64'), sha256: 'ab'.repeat(32) })).rejects.toMatchObject({ code: 'invalid_input' });
    expect(objects.size).toBe(0);
    expect(await imageOf()).toBeNull();
  });

  it('upload without a store is an internal error', async () => {
    await expect(upload(1, me, noStore)).rejects.toMatchObject({ code: 'internal', message: 'Avatar storage is not configured' });
  });

  it('re-upload deletes the old object, same sha keeps it', async () => {
    await upload(1);
    await upload(1);
    expect(deleted).toEqual([]);
    expect(objects.has(keyOf('u1', 1))).toBe(true);
    await upload(2);
    expect(deleted).toEqual([keyOf('u1', 1)]);
    expect(objects.has(keyOf('u1', 1))).toBe(false);
    expect(await imageOf()).toBe(pathOf('u1', 2));
  });

  it('an image pointing at another user path is never deleted', async () => {
    objects.set(keyOf('u2', 9), png(9));
    await setImage(pathOf('u2', 9));
    await upload(1);
    await setImage(pathOf('u2', 9));
    await registry.invoke(me, 'remove_my_avatar', {});
    expect(deleted).toEqual([]);
    expect(objects.has(keyOf('u2', 9))).toBe(true);
  });

  it('upload over a Google URL deletes nothing', async () => {
    await setImage('https://lh3.googleusercontent.com/a/x');
    await upload(1);
    expect(deleted).toEqual([]);
    expect(await imageOf()).toBe(pathOf('u1', 1));
  });

  it('remove clears and deletes', async () => {
    await upload(1);
    expect(await registry.invoke(me, 'remove_my_avatar', {})).toEqual({ ok: true });
    expect(await imageOf()).toBeNull();
    expect(deleted).toEqual([keyOf('u1', 1)]);
  });

  it('a failed delete still succeeds', async () => {
    await upload(1);
    failDelete = true;
    expect(await registry.invoke(me, 'remove_my_avatar', {})).toEqual({ ok: true });
    expect(await imageOf()).toBeNull();
    expect(await upload(2)).toEqual({ avatarUrl: pathOf('u1', 2) });
  });

  it('a store without delete logs an error and still succeeds', async () => {
    const noDelete = createToolRegistry(
      { app: dbs.app, service: dbs.service, evidenceStore: { get: evidenceStore.get, put: evidenceStore.put }, billing: fakeGateway() },
      { audit: { record: async () => {} } },
    );
    await upload(1, me, noDelete);
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      expect(await noDelete.invoke(me, 'remove_my_avatar', {})).toEqual({ ok: true });
      expect(spy).toHaveBeenCalledWith('[avatar] delete failed', 'store has no delete');
    } finally {
      spy.mockRestore();
    }
    expect(await imageOf()).toBeNull();
    expect(objects.has(keyOf('u1', 1))).toBe(true);
  });

  it('guests and support sessions are refused', async () => {
    for (const [tool, input] of [['get_my_profile', {}], ['update_my_profile', { name: 'X' }], ['remove_my_avatar', {}], ['get_my_notification_settings', {}]] as const) {
      await expect(registry.invoke(guest, tool, input), tool).rejects.toMatchObject({ code: 'permission_denied' });
    }
    await expect(upload(1, guest)).rejects.toMatchObject({ code: 'permission_denied' });
    for (const [tool, input] of [['get_my_profile', {}], ['get_my_notification_settings', {}], ['update_my_profile', { name: 'X' }], ['remove_my_avatar', {}]] as const) {
      await expect(registry.invoke(support, tool, input), tool).rejects.toBeTruthy();
    }
    await expect(upload(1, support)).rejects.toBeTruthy();
    expect(await nameOf()).toBe('u1@e.co');
  });

  it('paused agency: update and upload refused, remove allowed', async () => {
    const [{ id: planId }] = (await dbs.owner.insert(plan).values({ code: 'standard', version: 1, name: 'Standard', basePriceCents: 22900, includedSeats: 3, seatPriceCents: 9900, trialDays: 30, isCurrent: true, createdBy: 'test' }).returning({ id: plan.id })) as [{ id: string }];
    await upload(1);
    await dbs.owner.insert(agencyBilling).values({ agencyId: IDS.agencyA, state: 'read_only', planId });
    await expect(registry.invoke(me, 'update_my_profile', { name: 'X' })).rejects.toMatchObject({ code: 'service_paused' });
    await expect(upload(2)).rejects.toMatchObject({ code: 'service_paused' });
    expect(await registry.invoke(me, 'remove_my_avatar', {})).toEqual({ ok: true });
    expect(await imageOf()).toBeNull();
  });
});
