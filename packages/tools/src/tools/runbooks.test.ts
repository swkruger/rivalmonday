import { type AccessContext, createAccessContext } from '@cs/core';
import { catalogRows, client, platformAdmin, runbook, runbookItem } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { createCatalog } from '@cs/verticals';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { seedUser, truncateAuth } from '../../test/fixtures';
import type { ToolDeps } from '../deps';
import { createToolRegistry } from '../registry';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const catalog = createCatalog(() => catalogRows(dbs.service), { ttlMs: 0 });
const enqueue = vi.fn(async (..._a: unknown[]) => {});
const tailorer = vi.fn();
let withTailorer = true;
const deps = (): ToolDeps => ({
  app: dbs.app, service: dbs.service, catalog, platformAdmins: [], enqueue: enqueue as ToolDeps['enqueue'],
  ...(withTailorer ? { runbookTailorer: tailorer } : {}),
});
const mk = (userId: string, role: 'agency_admin' | 'account_manager' | 'client_owner' | 'client_viewer', agencyId: string = IDS.agencyA, scope: 'all' | string[] = 'all') =>
  createAccessContext({ agencyId, userId, role, clientScope: scope, features: [] });
const admin = mk('admin', 'agency_admin');
const adminB = mk('adminb', 'agency_admin', IDS.agencyB);
const am = mk('am', 'account_manager', IDS.agencyA, [IDS.clientA1]);
const owner = mk('owner', 'client_owner', IDS.agencyA, [IDS.clientA1]);
const viewer = mk('cviewer', 'client_viewer', IDS.agencyA, [IDS.clientA1]);
const staff = mk('staff', 'agency_admin');
const pviewer = mk('pviewer', 'agency_admin');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const call = <T = any>(ctx: AccessContext, tool: string, input: Record<string, unknown> = {}) =>
  createToolRegistry(deps(), { audit: { record: async () => {} } }).invoke(ctx, tool, input) as Promise<T>;
const fails = async (p: Promise<unknown>) => {
  try { await p; } catch (e) { return e as { code?: string; message: string }; }
  throw new Error('expected a failure');
};

const P = { level: 'platform' } as const;
const A = { level: 'agency' } as const;
const C1 = { level: 'client', clientId: IDS.clientA1 } as const;
const play = (title: string) => ({ trigger: 'price_change', title, template: 'Respond to {{competitor}} on {{service}}.' });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;

async function firstPlayKey(o: object): Promise<string> {
  const r = await call(admin, 'get_runbook', { owner: o });
  return r.items.find((i: Row) => i.kind === 'play').key;
}
const itemOf = async (ctx: AccessContext, o: object, key: string): Promise<Row> => (await call(ctx, 'get_runbook', { owner: o })).items.find((i: Row) => i.key === key);

beforeEach(async () => {
  enqueue.mockClear();
  tailorer.mockReset();
  withTailorer = true;
  await truncateAll(dbs.owner);
  await truncateAuth(dbs.owner);
  for (const u of ['admin', 'adminb', 'am', 'owner', 'cviewer', 'staff', 'pviewer']) await seedUser(dbs.owner, u, `${u}@example.com`);
  await seedTenancy(dbs.owner);
  await dbs.owner.delete(runbook);
  await dbs.owner.insert(platformAdmin).values([
    { userId: 'staff', role: 'staff', createdBy: 't' },
    { userId: 'pviewer', role: 'viewer', createdBy: 't' },
  ]);
});

describe('gates', () => {
  it.each([['client_owner', owner], ['client_viewer', viewer]])('%s gets not_found on every level and tool', async (_n, ctx) => {
    for (const o of [P, A, C1]) expect((await fails(call(ctx, 'get_runbook', { owner: o }))).code).toBe('not_found');
    expect((await fails(call(ctx, 'update_runbook_item', { owner: C1, key: 'play:x', content: play('x') }))).code).toBe('not_found');
  });

  it('another agency and an out-of-scope AM get not_found for a client', async () => {
    expect((await fails(call(adminB, 'get_runbook', { owner: C1 }))).code).toBe('not_found');
    expect((await fails(call(am, 'get_runbook', { owner: { level: 'client', clientId: IDS.clientA2 } }))).code).toBe('not_found');
    expect((await fails(call(admin, 'get_runbook', { owner: { level: 'client', clientId: '00000000-0000-4000-8000-0000000000ff' } }))).code).toBe('not_found');
  });

  it('an account manager reads the agency level but cannot edit it', async () => {
    const key = await firstPlayKey(A);
    expect((await call(am, 'get_runbook', { owner: A })).level).toBe('agency');
    expect((await fails(call(am, 'update_runbook_item', { owner: A, key, content: play('x') }))).code).toBe('not_found');
    expect((await fails(call(am, 'set_runbook_item_enabled', { owner: A, key, enabled: false }))).code).toBe('not_found');
  });

  it('the platform level needs an operator (staff to write)', async () => {
    expect((await fails(call(admin, 'get_runbook', { owner: P }))).code).toBe('not_found');
    expect((await call(pviewer, 'get_runbook', { owner: P })).level).toBe('platform');
    const key = await firstPlayKey(A);
    expect((await fails(call(pviewer, 'update_runbook_item', { owner: P, key, content: play('x') }))).code).toBe('not_found');
    expect((await fails(call(admin, 'update_runbook_item', { owner: P, key, content: play('x') }))).code).toBe('not_found');
  });
});

describe('get_runbook', () => {
  it('creates the agency runbook lazily and reports in_sync items with the vars', async () => {
    expect(await dbs.owner.select().from(runbook)).toHaveLength(0);
    const r = await call(admin, 'get_runbook', { owner: A });
    expect(await dbs.owner.select().from(runbook).where(eq(runbook.level, 'agency'))).toHaveLength(1);
    expect(r.items.length).toBeGreaterThan(0);
    expect(r.items.every((i: Row) => i.state === 'in_sync' && i.parent)).toBe(true);
    expect(r.vars).toContain('competitor');
    expect(r.businessAreas).toEqual([]);
  });

  it('a client without a runbook sees the effective items read-only, with a source and its service list', async () => {
    const r = await call(admin, 'get_runbook', { owner: C1 });
    expect(['agency', 'legacy']).toContain(r.source);
    expect(r.tailorStatus).toBeNull();
    expect(r.items.length).toBeGreaterThan(0);
    expect(Array.isArray(r.businessAreas)).toBe(true);
    expect(await dbs.owner.select().from(runbook).where(eq(runbook.level, 'client'))).toHaveLength(0);
    expect((await fails(call(admin, 'update_runbook_item', { owner: C1, key: r.items[0].key, content: play('x') }))).message).toMatch(/Create the client runbook/);
  });
});

describe('platform edits', () => {
  it('a platform edit bumps the version and the agency sees update_available; pulling brings it in', async () => {
    const key = await firstPlayKey(A);
    const v0 = (await itemOf(staff, P, key)).version;
    const upd = await call(staff, 'update_runbook_item', { owner: P, key, content: play('Platform new') });
    expect(upd.version).toBe(v0 + 1);
    expect(await itemOf(admin, A, key)).toMatchObject({ state: 'update_available', parent: { version: v0 + 1 } });

    const pulled = await call(admin, 'pull_runbook_update', { owner: A, key });
    expect(pulled).toMatchObject({ content: expect.objectContaining({ title: 'Platform new' }), upstreamVersion: v0 + 1, customised: false });
    expect((await itemOf(admin, A, key)).state).toBe('in_sync');
  });

  it('dismiss hides the update; a newer one shows again', async () => {
    const key = await firstPlayKey(A);
    await call(staff, 'update_runbook_item', { owner: P, key, content: play('P2') });
    const d = await call(admin, 'dismiss_runbook_update', { owner: A, key });
    expect(d.dismissedUpstreamVersion).toBeGreaterThan(1);
    expect((await itemOf(admin, A, key)).state).toBe('in_sync');
    await call(staff, 'update_runbook_item', { owner: P, key, content: play('P3') });
    expect((await itemOf(admin, A, key)).state).toBe('update_available');
  });
});

describe('agency edits', () => {
  it('update marks the item customised; enable/disable toggles; invalid content is refused with the zod message', async () => {
    const key = await firstPlayKey(A);
    const u = await call(admin, 'update_runbook_item', { owner: A, key, content: play('Mine') });
    expect(u).toMatchObject({ customised: true, content: expect.objectContaining({ title: 'Mine' }) });
    expect((await call(admin, 'set_runbook_item_enabled', { owner: A, key, enabled: false })).enabled).toBe(false);
    const bad = await fails(call(admin, 'update_runbook_item', { owner: A, key, content: { ...play('x'), template: 'Hello {{nope}}' } }));
    expect(bad.code).toBe('invalid_input');
    expect(bad.message).toMatch(/unknown placeholder/);
    expect((await fails(call(admin, 'update_runbook_item', { owner: A, key, content: play('x{{competitor}}') }))).code).toBe('invalid_input');
    expect((await fails(call(admin, 'update_runbook_item', { owner: A, key: 'play:missing', content: play('x') }))).code).toBe('not_found');
  });

  it('remove tombstones an item the platform has, and add adopts a genuinely new upstream item', async () => {
    const key = await firstPlayKey(A);
    expect(await call(admin, 'remove_runbook_item', { owner: A, key })).toEqual({ ok: true });
    expect(await itemOf(admin, A, key)).toMatchObject({ enabled: false, state: 'in_sync' });

    const [pf] = await dbs.owner.select().from(runbook).where(eq(runbook.level, 'platform'));
    await dbs.owner.insert(runbookItem).values({ runbookId: pf!.id, itemKey: 'play:brand_new', kind: 'play', content: play('Brand new'), updatedBy: 't' });
    expect(await itemOf(admin, A, 'play:brand_new')).toMatchObject({ state: 'new_upstream', enabled: false });
    const added = await call(admin, 'add_runbook_item', { owner: A, key: 'play:brand_new' });
    expect(added).toMatchObject({ enabled: true, upstreamVersion: 1, customised: false });
    expect((await fails(call(admin, 'add_runbook_item', { owner: A, key: 'play:brand_new' }))).code).toBe('not_found');

    // a platform-level item has no parent: removing it deletes the row
    await call(staff, 'remove_runbook_item', { owner: P, key: 'play:brand_new' });
    expect(await dbs.owner.select().from(runbookItem).where(eq(runbookItem.runbookId, pf!.id)).then((r) => r.some((x) => x.itemKey === 'play:brand_new'))).toBe(false);
  });
});

describe('client runbook', () => {
  it("key '*' creates the client runbook (pending) and enqueues tailoring after commit", async () => {
    expect(await call(am, 'add_runbook_item', { owner: C1, key: '*' })).toBeNull();
    const [rb] = await dbs.owner.select().from(runbook).where(eq(runbook.level, 'client'));
    expect(rb).toMatchObject({ clientId: IDS.clientA1, tailorStatus: 'pending' });
    expect((await dbs.owner.select().from(runbookItem).where(eq(runbookItem.runbookId, rb!.id))).length).toBeGreaterThan(0);
    expect(enqueue).toHaveBeenCalledWith('runbook-tailor', { clientId: IDS.clientA1 }, `runbook-tailor:${IDS.clientA1}`);
    expect((await fails(call(am, 'add_runbook_item', { owner: C1, key: '*' }))).message).toMatch(/already has a runbook/);
    expect((await call(am, 'get_runbook', { owner: C1 })).source).toBe('client');
    expect((await fails(call(admin, 'add_runbook_item', { owner: A, key: '*' }))).code).toBe('not_found');
  });

  it('a paused client gets the runbook but no pending status and no job; an enqueue failure does not fail the call', async () => {
    await dbs.owner.update(client).set({ pausedAt: new Date() }).where(eq(client.id, IDS.clientA1));
    await call(admin, 'add_runbook_item', { owner: C1, key: '*' });
    const [rb] = await dbs.owner.select().from(runbook).where(eq(runbook.level, 'client'));
    expect(rb!.tailorStatus).toBeNull();
    expect(enqueue).not.toHaveBeenCalled();

    await dbs.owner.delete(runbook).where(eq(runbook.level, 'client'));
    await dbs.owner.update(client).set({ pausedAt: null }).where(eq(client.id, IDS.clientA1));
    enqueue.mockRejectedValueOnce(new Error('queue down'));
    await call(admin, 'add_runbook_item', { owner: C1, key: '*' });
    expect((await dbs.owner.select().from(runbook).where(eq(runbook.level, 'client')))[0]!.tailorStatus).toBe('pending');
  });

  it('an account manager in scope edits the client level; unknown services are refused', async () => {
    await call(am, 'add_runbook_item', { owner: C1, key: '*' });
    const r = await call(am, 'get_runbook', { owner: C1 });
    const key = r.items.find((i: Row) => i.kind === 'play').key;
    const u = await call(am, 'update_runbook_item', { owner: C1, key, content: play('Client wording') });
    expect(u.customised).toBe(true);
    expect((await fails(call(am, 'update_runbook_item', { owner: C1, key, content: play('x'), businessAreaIds: ['no_such_service'] }))).code).toBe('invalid_input');
  });

  it('the thresholds knob writes client.score_thresholds through the set_alert_rules rules', async () => {
    await call(admin, 'add_runbook_item', { owner: C1, key: '*' });
    const u = await call(admin, 'update_runbook_item', { owner: C1, key: 'knob:thresholds', content: { alert: 80, brief: 40 } });
    expect(u.content).toEqual({ alert: 80, brief: 40 });
    const thresholds = async () => (await dbs.owner.select({ t: client.scoreThresholds }).from(client).where(eq(client.id, IDS.clientA1)))[0]!.t;
    expect(await thresholds()).toEqual({ alert: 80, brief: 40 });
    expect((await itemOf(admin, C1, 'knob:thresholds')).content).toEqual({ alert: 80, brief: 40 });
    expect((await fails(call(admin, 'update_runbook_item', { owner: C1, key: 'knob:thresholds', content: { alert: 1, brief: 0 } }))).code).toBe('invalid_input');
    await call(admin, 'set_runbook_item_enabled', { owner: C1, key: 'knob:thresholds', enabled: false });
    expect(await thresholds()).toBeNull();
  });

  it('the thresholds column follows the item: re-enable restores it, an update while disabled leaves it null', async () => {
    await call(admin, 'add_runbook_item', { owner: C1, key: '*' });
    const thresholds = async () => (await dbs.owner.select({ t: client.scoreThresholds }).from(client).where(eq(client.id, IDS.clientA1)))[0]!.t;
    await call(admin, 'update_runbook_item', { owner: C1, key: 'knob:thresholds', content: { alert: 80, brief: 40 } });
    await call(admin, 'set_runbook_item_enabled', { owner: C1, key: 'knob:thresholds', enabled: false });
    expect(await thresholds()).toBeNull();
    await call(admin, 'update_runbook_item', { owner: C1, key: 'knob:thresholds', content: { alert: 70, brief: 30 } });
    expect(await thresholds()).toBeNull();
    await call(admin, 'set_runbook_item_enabled', { owner: C1, key: 'knob:thresholds', enabled: true });
    expect(await thresholds()).toEqual({ alert: 70, brief: 30 });
  });

  it('the column holds a value only for an enabled, customised knob: copy and pure pull keep it null, a reviewed pull sets it', async () => {
    const thresholds = async () => (await dbs.owner.select({ t: client.scoreThresholds }).from(client).where(eq(client.id, IDS.clientA1)))[0]!.t;
    await call(admin, 'add_runbook_item', { owner: C1, key: '*' });
    expect(await thresholds()).toBeNull();
    await call(admin, 'update_runbook_item', { owner: C1, key: 'knob:thresholds', content: { alert: 80, brief: 40 } });
    expect(await thresholds()).toEqual({ alert: 80, brief: 40 });
    await call(admin, 'update_runbook_item', { owner: A, key: 'knob:thresholds', content: { alert: 90, brief: 50 } });
    await call(admin, 'pull_runbook_update', { owner: C1, key: 'knob:thresholds' });
    expect((await itemOf(admin, C1, 'knob:thresholds')).content).toEqual({ alert: 90, brief: 50 });
    expect(await thresholds()).toBeNull();
    await call(admin, 'update_runbook_item', { owner: A, key: 'knob:thresholds', content: { alert: 95, brief: 55 } });
    await call(admin, 'pull_runbook_update', { owner: C1, key: 'knob:thresholds', content: { alert: 60, brief: 20 } });
    expect(await thresholds()).toEqual({ alert: 60, brief: 20 });
    await call(admin, 'set_runbook_item_enabled', { owner: C1, key: 'knob:thresholds', enabled: false });
    expect(await thresholds()).toBeNull();
  });

  it('set_alert_rules keeps the client runbook knob in step: customised values survive an off/on toggle; "use defaults" makes it non-customised', async () => {
    const thresholds = async () => (await dbs.owner.select({ t: client.scoreThresholds }).from(client).where(eq(client.id, IDS.clientA1)))[0]!.t;
    await call(admin, 'add_runbook_item', { owner: C1, key: '*' });
    await call(admin, 'set_alert_rules', { clientId: IDS.clientA1, alert: 80, brief: 40 });
    expect(await itemOf(admin, C1, 'knob:thresholds')).toMatchObject({ content: { alert: 80, brief: 40 }, enabled: true, customised: true });
    await call(admin, 'set_runbook_item_enabled', { owner: C1, key: 'knob:thresholds', enabled: false });
    expect(await thresholds()).toBeNull();
    await call(admin, 'set_runbook_item_enabled', { owner: C1, key: 'knob:thresholds', enabled: true });
    expect(await thresholds()).toEqual({ alert: 80, brief: 40 });
    await call(admin, 'set_alert_rules', { clientId: IDS.clientA1, reset: true });
    expect(await thresholds()).toBeNull();
    const item = await itemOf(admin, C1, 'knob:thresholds');
    expect(item.customised).toBe(false);
    expect(item.content).toEqual(item.parent.content);
  });

  it('agency and platform threshold defaults follow the same rules as set_alert_rules', async () => {
    for (const [ctx, o] of [[admin, A], [staff, P]] as const) {
      expect((await fails(call(ctx, 'update_runbook_item', { owner: o, key: 'knob:thresholds', content: { alert: 1, brief: 0 } }))).code).toBe('invalid_input');
      expect((await call(ctx, 'update_runbook_item', { owner: o, key: 'knob:thresholds', content: { alert: 90, brief: 50 } })).content).toEqual({ alert: 90, brief: 50 });
    }
  });

  it("the '*' path stores pending with the runbook itself", async () => {
    await call(admin, 'add_runbook_item', { owner: C1, key: '*' });
    const [rb] = await dbs.owner.select().from(runbook).where(eq(runbook.level, 'client'));
    expect(rb!.tailorStatus).toBe('pending');
  });

  it('retailor proposes without saving; an absent tailorer answers null; unknown key and client roles are not_found', async () => {
    const key = await firstPlayKey(A);
    tailorer.mockResolvedValue({ title: 'T', template: 'x {{competitor}}', businessAreaIds: null });
    const r = await call(am, 'retailor_runbook_item', { owner: C1, key });
    expect(r.proposed).toEqual({ title: 'T', template: 'x {{competitor}}', businessAreaIds: null });
    expect(tailorer).toHaveBeenCalledWith(expect.objectContaining({ clientId: IDS.clientA1, key, parentContent: expect.objectContaining({ trigger: expect.any(String) }) }));
    expect(await dbs.owner.select().from(runbook).where(eq(runbook.level, 'client'))).toHaveLength(0);
    withTailorer = false;
    expect((await call(am, 'retailor_runbook_item', { owner: C1, key })).proposed).toBeNull();
    expect((await fails(call(am, 'retailor_runbook_item', { owner: C1, key: 'play:nope' }))).code).toBe('not_found');
    expect((await fails(call(owner, 'retailor_runbook_item', { owner: C1, key }))).code).toBe('not_found');
  });

  it('pull at the client level takes the reviewed content and the parent version; remove tombstones', async () => {
    await call(admin, 'add_runbook_item', { owner: C1, key: '*' });
    const key = (await call(admin, 'get_runbook', { owner: C1 })).items.find((i: Row) => i.kind === 'play').key;
    await call(admin, 'update_runbook_item', { owner: A, key, content: play('Agency v2') });
    const st = await itemOf(admin, C1, key);
    expect(st.state).toBe('update_available');
    const pulled = await call(admin, 'pull_runbook_update', { owner: C1, key, content: play('Reviewed v2') });
    expect(pulled).toMatchObject({ content: expect.objectContaining({ title: 'Reviewed v2' }), upstreamVersion: st.parent.version, customised: true });
    expect((await itemOf(admin, C1, key)).state).toBe('in_sync');
    await call(admin, 'remove_runbook_item', { owner: C1, key });
    expect(await itemOf(admin, C1, key)).toMatchObject({ enabled: false, state: 'in_sync' });
  });
});
