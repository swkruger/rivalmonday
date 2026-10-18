import { type AccessContext, createAccessContext } from '@cs/core';
import { capture, catalogRows, changeEvent, client, platformAdmin, playbookOverride, priceBlockMap, pricePoint, review, reviewAnalysis, themeProposal, trackedPage, agencyProfile, llmCall } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { createCatalog } from '@cs/verticals';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { seedUser, truncateAuth } from '../../test/fixtures';
import type { ToolDeps } from '../deps';
import { createToolRegistry } from '../registry';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
// Own catalogue instance: no shared cache with other tests.
const catalog = createCatalog(() => catalogRows(dbs.service), { ttlMs: 0 });
const deps = (): ToolDeps => ({ app: dbs.app, service: dbs.service, catalog, platformAdmins: ['op@example.com'] });
const ctxOf = (userId: string, agencyId: string = IDS.agencyA) => createAccessContext({ agencyId, userId, role: 'agency_admin', clientScope: 'all', features: [] });
const op = ctxOf('op');
const staff = ctxOf('staff');
const viewer = ctxOf('viewer');
const adminA = ctxOf('admin');
const adminB = ctxOf('adminb', IDS.agencyB);
const call = <T = unknown>(ctx: AccessContext, tool: string, input: Record<string, unknown> = {}) =>
  createToolRegistry(deps(), { audit: { record: async () => {} } }).invoke(ctx, tool, input) as Promise<T>;
const fails = async (p: Promise<unknown>) => {
  try { await p; } catch (e) { return e as { code?: string; message: string }; }
  throw new Error('expected a failure');
};
const q = async <T extends Record<string, unknown>>(query: ReturnType<typeof sql>) => (await dbs.owner.execute(query)) as unknown as T[];

const PAGE1 = '00000000-0000-4000-8000-0000000000e1';
const PAGE2 = '00000000-0000-4000-8000-0000000000e2';
const CAP = '00000000-0000-4000-8000-0000000000c1';

const distillery = { name: 'Craft distilleries', areas: [{ name: 'Tasting room' }, { name: 'Bottle sales' }], categories: ['Distillery'], relatedCategories: ['Liquor store'] };
const brewery = { name: 'Craft breweries', areas: [{ name: 'Taproom' }, { name: 'Growler fills' }], categories: ['Brewery', 'Brewpub'] };


const ppSql = (page: string, vertical: string, service: string) => sql`insert into price_point (competitor_id, tracked_page_id, vertical_id, service_id, amount, unit, qualifier, raw, context, first_seen_at, last_seen_at, first_capture_id, last_capture_id)
  values (${IDS.competitorX}, ${page}, ${vertical}, ${service}, 10, 'USD', 'from', '$10', 'from $10', now(), now(), ${CAP}, ${CAP})`;

async function seedMergeData(): Promise<void> {
  await call(adminA, 'create_vertical', distillery);
  await call(adminB, 'create_vertical', brewery);
  await dbs.owner.update(client).set({ verticalId: 'distillery', services: ['tasting_room', 'bottle_sales', 'tasting_room'] }).where(eq(client.id, IDS.clientA1));
  await dbs.owner.update(client).set({ verticalId: 'brewery', services: ['taproom'] }).where(eq(client.id, IDS.clientB1));
  await dbs.owner.update(client).set({ verticalId: 'distillery', services: ['taproom_x', 'tasting_room'] }).where(eq(client.id, IDS.clientA2));
  await dbs.owner.insert(changeEvent).values([
    { competitorId: IDS.competitorX, changeType: 'price', services: { distillery: 'tasting_room' }, summary: 'e1', confidence: 1, occurredAt: new Date() },
    { competitorId: IDS.competitorX, changeType: 'price', services: { distillery: null, brewery: 'taproom' }, summary: 'e2', confidence: 1, occurredAt: new Date() },
    { competitorId: IDS.competitorX, changeType: 'price', services: { distillery: null }, summary: 'e3', confidence: 1, occurredAt: new Date(), retractedAt: new Date() },
    { competitorId: IDS.competitorX, changeType: 'price', services: { distillery: 'bottle_sales' }, summary: 'e4', confidence: 1, occurredAt: new Date() },
  ]);
  await dbs.owner.insert(trackedPage).values([
    { id: PAGE1, competitorId: IDS.competitorX, url: 'https://smithhvac.example/p1', pageType: 'pricing', source: 'manual', cadence: 'daily' },
    { id: PAGE2, competitorId: IDS.competitorX, url: 'https://smithhvac.example/p2', pageType: 'pricing', source: 'manual', cadence: 'daily' },
  ]);
  await dbs.owner.insert(capture).values({ id: CAP, competitorId: IDS.competitorX, trackedPageId: PAGE1, source: 'web', status: 'ok', collectorVersion: 'web/1' });
  const pp = (page: string, vertical: string, service: string) => ({
    competitorId: IDS.competitorX, trackedPageId: page, verticalId: vertical, serviceId: service, amount: 10, unit: 'USD', qualifier: 'from' as const,
    raw: '$10', context: 'from $10', firstSeenAt: new Date(), lastSeenAt: new Date(), firstCaptureId: CAP, lastCaptureId: CAP,
  });
  await dbs.owner.insert(pricePoint).values([pp(PAGE1, 'distillery', 'tasting_room'), pp(PAGE1, 'brewery', 'taproom'), pp(PAGE2, 'distillery', 'bottle_sales')]);
  const [r] = await dbs.owner.insert(review).values({ competitorId: IDS.competitorX, dedupeKey: 'id:r1', rating: 4, text: 'Nice' }).returning({ id: review.id });
  await dbs.owner.insert(reviewAnalysis).values({ reviewId: r!.id, verticalId: 'distillery', competitorId: IDS.competitorX, textSha: 's', confidence: 0.9, analysisVersion: 1 });
  await dbs.owner.insert(priceBlockMap).values({ textSha: 'abc', verticalId: 'distillery', serviceId: 'tasting_room', confidence: 0.9 });
  await dbs.owner.insert(themeProposal).values([
    { verticalId: 'distillery', themeId: 'tours', name: 'Tours', description: 'd', otherCount: 20 },
    { verticalId: 'distillery', themeId: 'old', name: 'Old', description: 'd', otherCount: 20, status: 'approved' },
  ]);
  await dbs.owner.insert(playbookOverride).values([
    { agencyId: IDS.agencyA, verticalId: 'distillery', playbookId: 'pb1', title: 'src', updatedBy: 'x' },
    { agencyId: IDS.agencyA, verticalId: 'brewery', playbookId: 'pb1', title: 'tgt', updatedBy: 'x' },
    { agencyId: IDS.agencyA, verticalId: 'distillery', playbookId: 'pb2', title: 'moved', updatedBy: 'x' },
  ]);
  await dbs.owner.insert(agencyProfile).values({ agencyId: IDS.agencyA, verticals: ['distillery', 'dental'] });
}

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await truncateAuth(dbs.owner);
  for (const u of ['op', 'staff', 'viewer', 'admin', 'adminb']) await seedUser(dbs.owner, u, `${u}@example.com`);
  await seedTenancy(dbs.owner);
  await dbs.owner.insert(platformAdmin).values([
    { userId: 'staff', role: 'staff', createdBy: 'test' },
    { userId: 'viewer', role: 'viewer', createdBy: 'test' },
  ]);
});

describe('merge_vertical', () => {
  it('rewrites every reference in one transaction', async () => {
    await seedMergeData();
    const out = await call<{ clientsMoved: number }>(staff, 'merge_vertical', {
      sourceId: 'distillery', targetId: 'brewery', areaMap: { tasting_room: 'taproom', bottle_sales: null },
    });
    expect(out).toEqual({ clientsMoved: 2 });

    const clients = await q<{ id: string; vertical_id: string; services: string[] }>(sql`select id, vertical_id, services from client where id in (${IDS.clientA1}, ${IDS.clientA2}) order by id`);
    expect(clients).toEqual([
      { id: IDS.clientA1, vertical_id: 'brewery', services: ['taproom', 'bottle_sales'] },
      { id: IDS.clientA2, vertical_id: 'brewery', services: ['taproom_x', 'taproom'] },
    ]);

    const events = await q<{ summary: string; services: Record<string, string | null> }>(sql`select summary, services from event order by summary`);
    expect(events).toEqual([
      { summary: 'e1', services: { brewery: 'taproom' } },
      { summary: 'e2', services: { brewery: 'taproom' } },
      { summary: 'e3', services: { brewery: null } },
      { summary: 'e4', services: { brewery: 'bottle_sales' } },
    ]);

    const prices = await q<{ tracked_page_id: string; vertical_id: string; service_id: string }>(sql`select tracked_page_id, vertical_id, service_id from price_point order by tracked_page_id`);
    expect(prices).toEqual([
      { tracked_page_id: PAGE1, vertical_id: 'brewery', service_id: 'taproom' },
      { tracked_page_id: PAGE2, vertical_id: 'brewery', service_id: 'bottle_sales' },
    ]);

    expect(await q(sql`select 1 from review_analysis`)).toHaveLength(0);
    expect(await q(sql`select 1 from price_block_map`)).toHaveLength(0);
    expect(await q<{ status: string }>(sql`select status from theme_proposal`)).toEqual([{ status: 'approved' }]);

    const pbs = await q<{ vertical_id: string; playbook_id: string; title: string }>(sql`select vertical_id, playbook_id, title from playbook_override order by playbook_id`);
    expect(pbs).toEqual([
      { vertical_id: 'brewery', playbook_id: 'pb1', title: 'tgt' },
      { vertical_id: 'brewery', playbook_id: 'pb2', title: 'moved' },
    ]);
    const [prof] = await q<{ verticals: string[] }>(sql`select verticals from agency_profile`);
    expect([...prof!.verticals].sort()).toEqual(['brewery', 'dental']);

    const areas = await q<{ vertical_id: string; id: string; status: string; merged_into: string | null }>(sql`select vertical_id, id, status, merged_into from business_area where id in ('tasting_room', 'bottle_sales') order by id`);
    expect(areas).toEqual([
      { vertical_id: 'brewery', id: 'bottle_sales', status: 'unreviewed', merged_into: null },
      { vertical_id: 'distillery', id: 'tasting_room', status: 'merged', merged_into: 'taproom' },
    ]);

    const rows = await q<{ id: string; status: string; merged_into: string | null; version: number; gbp_categories: string[]; gbp_related_categories: string[] }>(sql`select id, status, merged_into, version, gbp_categories, gbp_related_categories from vertical where id in ('distillery', 'brewery') order by id`);
    expect(rows[0]).toMatchObject({ id: 'brewery', status: 'unreviewed', version: 2, gbp_categories: ['brewery', 'brewpub'] });
    expect([...rows[0]!.gbp_related_categories].sort()).toEqual(['distillery', 'liquor store']);
    expect(rows[1]).toMatchObject({ id: 'distillery', status: 'merged', merged_into: 'brewery' });
    const cats = await q<{ category_lc: string; vertical_id: string; kind: string }>(sql`select category_lc, vertical_id, kind from vertical_category where category_lc in ('distillery', 'liquor store')`);
    expect(cats.every((c) => c.vertical_id === 'brewery' && c.kind === 'related')).toBe(true);

    expect(await catalog.resolveId('distillery')).toBe('brewery');
  });

  it('many-to-one areaMap: source rows that collapse onto one key keep exactly one', async () => {
    await seedMergeData();
    await dbs.owner.execute(sql`delete from price_point`);
    await dbs.owner.execute(ppSql(PAGE1, 'distillery', 'tasting_room'));
    await dbs.owner.execute(ppSql(PAGE1, 'distillery', 'bottle_sales'));
    await call(staff, 'merge_vertical', { sourceId: 'distillery', targetId: 'brewery', areaMap: { tasting_room: 'taproom', bottle_sales: 'taproom' } });
    expect(await q<{ vertical_id: string; service_id: string }>(sql`select vertical_id, service_id from price_point`)).toEqual([{ vertical_id: 'brewery', service_id: 'taproom' }]);
  });

  it('refuses itself, a merged row, generic, an incomplete or invalid areaMap, and a colliding move', async () => {
    await seedMergeData();
    const m = (over: Record<string, unknown>) => call(staff, 'merge_vertical', { sourceId: 'distillery', targetId: 'brewery', areaMap: { tasting_room: 'taproom', bottle_sales: null }, ...over });
    expect((await fails(m({ targetId: 'distillery' }))).code).toBe('invalid_input');
    expect((await fails(m({ sourceId: 'generic' }))).code).toBe('invalid_input');
    expect((await fails(m({ targetId: 'generic' }))).code).toBe('invalid_input');
    expect((await fails(m({ areaMap: { tasting_room: 'taproom' } }))).message).toMatch(/Bottle sales/);
    expect((await fails(m({ areaMap: { tasting_room: 'taproom', bottle_sales: null, ghost: null } }))).message).toMatch(/ghost/);
    expect((await fails(m({ areaMap: { tasting_room: 'nope', bottle_sales: null } }))).message).toMatch(/nope/);
    expect((await fails(m({ targetId: 'nothing' }))).code).toBe('not_found');
    // A moved id that already exists in the target
    await dbs.owner.execute(sql`insert into business_area (vertical_id, id, name, status) values ('brewery', 'bottle_sales', 'Bottle sales', 'unreviewed')`);
    expect((await fails(m({}))).message).toMatch(/already has/);
    // Nothing was written by the refusals
    expect(await q(sql`select 1 from vertical where status = 'merged'`)).toHaveLength(0);
    await m({ areaMap: { tasting_room: 'taproom', bottle_sales: 'bottle_sales' } });
    expect((await fails(call(staff, 'merge_vertical', { sourceId: 'brewery', targetId: 'distillery', areaMap: {} }))).code).toBe('invalid_input');
    expect((await fails(call(staff, 'merge_vertical', { sourceId: 'distillery', targetId: 'dental', areaMap: {} }))).code).toBe('invalid_input');
  });

  it('refuses non-operators and viewers', async () => {
    await seedMergeData();
    const input = { sourceId: 'distillery', targetId: 'brewery', areaMap: { tasting_room: 'taproom', bottle_sales: null } };
    expect((await fails(call(adminA, 'merge_vertical', input))).code).toBe('permission_denied');
    expect((await fails(call(viewer, 'merge_vertical', input))).code).toBe('permission_denied');
    expect((await fails(call(adminA, 'list_catalog_review'))).code).toBe('permission_denied');
    expect(await q(sql`select 1 from vertical where status = 'merged'`)).toHaveLength(0);
  });
});

describe('merge_business_area', () => {
  it('merges one area into another inside the vertical', async () => {
    await seedMergeData();
    const out = await call<{ clientsMoved: number }>(op, 'merge_business_area', { verticalId: 'distillery', sourceAreaId: 'bottle_sales', targetAreaId: 'tasting_room' });
    expect(out).toEqual({ clientsMoved: 1 });
    const [a1] = await q<{ services: string[] }>(sql`select services from client where id = ${IDS.clientA1}`);
    expect(a1!.services).toEqual(['tasting_room']);
    const events = await q<{ summary: string; services: Record<string, string | null> }>(sql`select summary, services from event order by summary`);
    expect(events.find((e) => e.summary === 'e4')!.services).toEqual({ distillery: 'tasting_room' });
    expect(events.find((e) => e.summary === 'e1')!.services).toEqual({ distillery: 'tasting_room' });
    const prices = await q<{ service_id: string }>(sql`select service_id from price_point where vertical_id = 'distillery' order by tracked_page_id`);
    expect(prices).toEqual([{ service_id: 'tasting_room' }, { service_id: 'tasting_room' }]);
    const [area] = await q<{ status: string; merged_into: string }>(sql`select status, merged_into from business_area where vertical_id = 'distillery' and id = 'bottle_sales'`);
    expect(area).toEqual({ status: 'merged', merged_into: 'tasting_room' });
    const [v] = await q<{ version: number }>(sql`select version from vertical where id = 'distillery'`);
    expect(v!.version).toBe(2);
  });

  it('drops source open prices that duplicate the target area on the same page (exactly one survives)', async () => {
    await seedMergeData();
    await dbs.owner.execute(sql`delete from price_point`);
    await dbs.owner.execute(ppSql(PAGE1, 'distillery', 'tasting_room'));
    await dbs.owner.execute(ppSql(PAGE1, 'distillery', 'bottle_sales'));
    await call(staff, 'merge_business_area', { verticalId: 'distillery', sourceAreaId: 'bottle_sales', targetAreaId: 'tasting_room' });
    expect(await q<{ service_id: string }>(sql`select service_id from price_point`)).toEqual([{ service_id: 'tasting_room' }]);
  });

  it('refuses bad inputs', async () => {
    await seedMergeData();
    await call(staff, 'merge_business_area', { verticalId: 'distillery', sourceAreaId: 'bottle_sales', targetAreaId: 'tasting_room' });
    const m = (over: Record<string, unknown>) => call(staff, 'merge_business_area', { verticalId: 'distillery', sourceAreaId: 'tasting_room', targetAreaId: 'bottle_sales', ...over });
    expect((await fails(m({}))).code).toBe('invalid_input'); // target already merged
    expect((await fails(m({ targetAreaId: 'tasting_room' }))).code).toBe('invalid_input');
    expect((await fails(m({ targetAreaId: 'ghost' }))).code).toBe('not_found');
    expect((await fails(m({ verticalId: 'generic' }))).code).toBe('invalid_input');
  });
});

describe('review_vertical / review_business_area / list_catalog_review', () => {
  it('lists unreviewed entries with creator, client count and draft cost, and approve clears them', async () => {
    await call(adminA, 'create_vertical', distillery);
    await dbs.owner.update(client).set({ verticalId: 'distillery', services: ['tasting_room'] }).where(eq(client.id, IDS.clientA1));
    await dbs.owner.insert(llmCall).values([
      { agencyId: IDS.agencyA, task: 'vertical_draft', provider: 'p', model: 'm', inputTokens: 1, outputTokens: 1, costUsd: 0.01, latencyMs: 1, ok: true, verticalId: 'distillery' },
      { agencyId: IDS.agencyA, task: 'vertical_draft', provider: 'p', model: 'm', inputTokens: 1, outputTokens: 1, costUsd: 0.02, latencyMs: 1, ok: true, verticalId: 'distillery' },
    ]);
    const list = await call<{ verticals: Record<string, unknown>[]; areas: Record<string, unknown>[]; count: number }>(viewer, 'list_catalog_review');
    expect(list.count).toBe(1);
    expect(list.areas).toEqual([]);
    expect(list.verticals[0]).toMatchObject({ id: 'distillery', createdBy: { agencyId: IDS.agencyA, name: 'Agency A' }, clientCount: 1, categories: ['distillery', 'liquor store'] });
    expect(list.verticals[0]!.draftCostUsd as number).toBeCloseTo(0.03);
    expect((list.verticals[0]!.services as unknown[]).length).toBe(2);

    expect(await call(staff, 'review_vertical', { verticalId: 'distillery', action: 'approve' })).toEqual({ verticalId: 'distillery', version: 1 });
    const [v] = await q<{ status: string; reviewed_by: string }>(sql`select status, reviewed_by from vertical where id = 'distillery'`);
    expect(v).toEqual({ status: 'reviewed', reviewed_by: 'staff' });
    // A later area from an agency waits on its own
    await call(adminA, 'add_business_area', { verticalId: 'distillery', name: 'Merch' });
    const after = await call<{ areas: { id: string; clientCount: number; verticalName: string }[]; verticals: unknown[]; count: number }>(viewer, 'list_catalog_review');
    expect(after).toMatchObject({ verticals: [], count: 1, areas: [{ id: 'merch', clientCount: 0, verticalName: 'Craft distilleries' }] });
    await call(staff, 'review_business_area', { verticalId: 'distillery', areaId: 'merch', action: 'approve' });
    expect((await call<{ count: number }>(viewer, 'list_catalog_review')).count).toBe(0);
  });

  it('rename keeps the id and refuses client data; approve does not bump the version', async () => {
    await call(adminA, 'create_vertical', distillery);
    const r = await call<{ verticalId: string; version: number }>(staff, 'review_vertical', { verticalId: 'distillery', action: 'rename', name: 'Spirit distilleries' });
    expect(r).toEqual({ verticalId: 'distillery', version: 2 });
    expect((await q<{ name: string }>(sql`select name from vertical where id = 'distillery'`))[0]!.name).toBe('Spirit distilleries');
    expect((await catalog.packs('distillery')).name).toBe('Spirit distilleries');
    expect((await fails(call(staff, 'review_vertical', { verticalId: 'distillery', action: 'rename', name: 'A1 HVAC' }))).code).toBe('invalid_input');
    expect((await fails(call(staff, 'review_vertical', { verticalId: 'distillery', action: 'rename', name: 'Call 512-555-0100' }))).code).toBe('invalid_input');
    expect((await fails(call(staff, 'review_vertical', { verticalId: 'distillery', action: 'rename' }))).code).toBe('invalid_input');
    expect((await fails(call(staff, 'review_vertical', { verticalId: 'generic', action: 'approve' }))).code).toBe('not_found');
    await call(staff, 'review_business_area', { verticalId: 'distillery', areaId: 'tasting_room', action: 'rename', name: 'Tours and tastings', aliases: ['tours'] });
    const [a] = await q<{ id: string; name: string; aliases: string[] }>(sql`select id, name, aliases from business_area where id = 'tasting_room'`);
    expect(a).toEqual({ id: 'tasting_room', name: 'Tours and tastings', aliases: ['tours'] });
    expect((await fails(call(viewer, 'review_vertical', { verticalId: 'distillery', action: 'approve' }))).code).toBe('permission_denied');
    expect((await fails(call(adminA, 'review_business_area', { verticalId: 'distillery', areaId: 'tasting_room', action: 'approve' }))).code).toBe('permission_denied');
  });

  it('update_vertical: platform staff may edit a reviewed vertical, its creator may not', async () => {
    await call(adminA, 'create_vertical', distillery);
    await call(staff, 'review_vertical', { verticalId: 'distillery', action: 'approve' });
    expect((await fails(call(adminA, 'update_vertical', { verticalId: 'distillery', name: 'Whisky makers' }))).code).toBe('permission_denied');
    expect(await call(staff, 'update_vertical', { verticalId: 'distillery', name: 'Whisky makers' })).toEqual({ verticalId: 'distillery', version: 2 });
    const otherAgencyStaff = ctxOf('staff', IDS.agencyB);
    expect((await fails(call(otherAgencyStaff, 'update_vertical', { verticalId: 'distillery', name: 'A1 HVAC' }))).code).toBe('invalid_input');
    await call(staff, 'merge_vertical', { sourceId: 'distillery', targetId: 'dental', areaMap: { tasting_room: null, bottle_sales: null } });
    expect((await fails(call(staff, 'update_vertical', { verticalId: 'distillery', name: 'Again' }))).code).toBe('permission_denied');
  });
});
