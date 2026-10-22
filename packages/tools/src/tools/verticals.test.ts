import { type AccessContext, createAccessContext } from '@cs/core';
import { catalogRows } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { createCatalog } from '@cs/verticals';
import { sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createToolRegistry } from '../registry';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
// Own catalogue instance: tests insert rows behind the tools' back, so no shared cache.
const catalog = createCatalog(() => catalogRows(dbs.service), { ttlMs: 0 });
const registry = createToolRegistry({ app: dbs.app, service: dbs.service, catalog }, { audit: { record: async () => {} } });
const ctx = (role: AccessContext['role'], agencyId: string = IDS.agencyA, support = false) =>
  createAccessContext({
    agencyId, userId: `u-${role}`, role, features: [],
    clientScope: role === 'agency_admin' ? 'all' : [agencyId === IDS.agencyA ? IDS.clientA1 : IDS.clientB1],
    ...(support ? { support: { sessionId: 's1', platformUserId: 'p1' } } : {}),
  });
const admin = ctx('agency_admin');
const am = ctx('account_manager');
const adminB = ctx('agency_admin', IDS.agencyB);
const viewer = ctx('client_viewer');

const distillery = {
  name: 'Craft distilleries',
  areas: [{ name: 'Tasting room', aliases: ['tastings'] }, { name: 'Bottle sales' }],
  audienceNoun: 'guests',
  seedKeywords: ['distillery near me'],
  categories: ['Distillery', ' Whisky Distillery '],
  relatedCategories: ['Liquor store'],
  topics: [{ name: 'Tour quality', description: 'How good the tour is' }],
};
type Created = { verticalId: string; droppedCategories: string[] };
const create = (c: AccessContext, input: Record<string, unknown> = distillery) => registry.invoke(c, 'create_vertical', input) as Promise<Created>;
const q = async <T extends Record<string, unknown>>(query: ReturnType<typeof sql>) => (await dbs.owner.execute(query)) as unknown as T[];

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
});

describe('create_vertical', () => {
  it('writes the vertical, areas and categories as unreviewed, owned by the agency', async () => {
    const out = await create(admin);
    expect(out).toEqual({ verticalId: 'distillery', droppedCategories: [] });
    const [v] = await q<{ status: string; created_by_agency_id: string; version: number; gbp_categories: string[]; gbp_related_categories: string[]; config: Record<string, unknown> }>(
      sql`select * from vertical where id = 'distillery'`);
    expect(v).toMatchObject({ status: 'unreviewed', created_by_agency_id: IDS.agencyA, version: 1, gbp_categories: ['distillery', 'whisky distillery'], gbp_related_categories: ['liquor store'] });
    expect(v!.config).toEqual({ audience_noun: 'guests', topics: [{ id: 'tour_quality', name: 'Tour quality', description: 'How good the tour is' }], discovery: { seed_keywords: ['distillery near me'] } });
    const areas = await q<{ id: string; status: string; aliases: string[] }>(sql`select id, status, aliases from business_area where vertical_id = 'distillery' order by id`);
    expect(areas).toEqual([{ id: 'bottle_sales', status: 'unreviewed', aliases: [] }, { id: 'tasting_room', status: 'unreviewed', aliases: ['tastings'] }]);
    const cats = await q<{ category_lc: string; kind: string }>(sql`select category_lc, kind from vertical_category where vertical_id = 'distillery' order by category_lc`);
    expect(cats).toEqual([{ category_lc: 'distillery', kind: 'primary' }, { category_lc: 'liquor store', kind: 'related' }, { category_lc: 'whisky distillery', kind: 'primary' }]);
    expect((await catalog.packs('distillery')).services.map((s) => s.id).sort()).toEqual(['bottle_sales', 'tasting_room']);
  });

  it('is idempotent for the same agency while unreviewed', async () => {
    await create(admin);
    expect(await create(admin)).toEqual({ verticalId: 'distillery', droppedCategories: [] });
    expect(await q(sql`select 1 from vertical where id like 'distill%'`)).toHaveLength(1);
  });

  it('refuses a similar existing business type with the decided copy', async () => {
    await create(admin);
    await expect(create(adminB, { ...distillery, name: 'Distillery', categories: ['Other category'] })).rejects.toMatchObject({
      code: 'conflict', userFacing: true, message: 'A similar business type already exists: Craft distilleries.',
    });
    await expect(create(admin, { ...distillery, name: 'Dental practice', categories: ['Dentist'] })).rejects.toMatchObject({ code: 'conflict', message: expect.stringContaining('Dental practices') });
  });

  it('drops categories another business type owns and returns them', async () => {
    const out = await create(admin, { ...distillery, categories: ['Distillery', 'HVAC contractor'], relatedCategories: ['Dentist'] });
    expect(out.droppedCategories.sort()).toEqual(['dentist', 'hvac contractor']);
    const cats = await q<{ category_lc: string }>(sql`select category_lc from vertical_category where vertical_id = 'distillery'`);
    expect(cats).toEqual([{ category_lc: 'distillery' }]);
  });

  it('refuses when every category is owned elsewhere', async () => {
    await expect(create(admin, { ...distillery, categories: ['HVAC contractor'] })).rejects.toMatchObject({
      code: 'invalid_input', message: 'Add at least one Google category that no other business type uses.',
    });
    expect(await q(sql`select 1 from vertical where id = 'distillery'`)).toHaveLength(0);
  });

  it('refuses a pack that would not validate, writing nothing', async () => {
    await expect(create(admin, { ...distillery, seedKeywords: ['x'] })).rejects.toMatchObject({ code: 'invalid_input' });
    await expect(create(admin, { ...distillery, name: 'The Local Shop' })).rejects.toMatchObject({ code: 'invalid_input' });
    expect(await q(sql`select 1 from vertical where created_by_agency_id is not null`)).toHaveLength(0);
    expect(await q(sql`select 1 from business_area where created_by_agency_id is not null`)).toHaveLength(0);
  });

  it('suffixes the slug when it collides with a different vertical', async () => {
    await dbs.owner.execute(sql`insert into vertical (id, name, status, merged_into) values ('distillery', 'Old stills', 'merged', 'dental')`);
    expect((await create(admin)).verticalId).toBe('distillery_2');
  });

  it('refuses names carrying client data (phone, email, url, client business name)', async () => {
    await dbs.owner.execute(sql`update client set name = 'Acme Heating' where id = ${IDS.clientA1}`);
    for (const name of ['Distillery 512-555-0147', 'Stills mail@acme.com', 'Stills acme.com/x', 'Acme Heating stills']) {
      await expect(create(admin, { ...distillery, name })).rejects.toMatchObject({ code: 'invalid_input' });
    }
    await expect(create(admin, { ...distillery, areas: [{ name: 'Call 512-555-0147' }] })).rejects.toMatchObject({ code: 'invalid_input' });
    await expect(create(admin, { ...distillery, areas: [{ name: 'Tastings', aliases: ['acme heating tastings'] }] })).rejects.toMatchObject({ code: 'invalid_input' });
  });

  it('matches client names as whole words only', async () => {
    await dbs.owner.execute(sql`update client set name = 'Ace' where id = ${IDS.clientA1}`);
    await expect(create(admin, { ...distillery, name: 'Furnace repair shops', categories: ['Furnace shop'] })).resolves.toMatchObject({ verticalId: 'furnace_repair_shop' });
    await expect(create(admin, { ...distillery, name: 'Ace Plumbing services', categories: ['Plumbing shop'] })).rejects.toMatchObject({ code: 'invalid_input' });
  });

  it('refuses a name containing the business being onboarded (not yet a client)', async () => {
    await expect(create(admin, { ...distillery, name: 'Hill Country Distillery tours', businessName: 'Hill Country Distillery' })).rejects.toMatchObject({ code: 'invalid_input', userFacing: true });
    await expect(create(admin, { ...distillery, areas: [{ name: 'hill country distillery tasting' }], businessName: 'Hill Country Distillery' })).rejects.toMatchObject({ code: 'invalid_input' });
    expect(await q(sql`select 1 from vertical where created_by_agency_id is not null`)).toHaveLength(0);
    await expect(create(admin, { ...distillery, businessName: 'Hill Country Distillery' })).resolves.toMatchObject({ verticalId: 'distillery' });
  });

  it('replays idempotently even when the first create got a suffixed slug', async () => {
    await dbs.owner.execute(sql`insert into vertical (id, name, status, merged_into) values ('distillery', 'Old stills', 'merged', 'dental')`);
    const first = await create(admin);
    expect(first.verticalId).toBe('distillery_2');
    expect(await create(admin)).toEqual({ verticalId: 'distillery_2', droppedCategories: [] });
    expect(await q(sql`select 1 from vertical where created_by_agency_id is not null`)).toHaveLength(1);
  });

  it('copies draft evidence cached by another agency (the cache is global by place)', async () => {
    await dbs.owner.execute(sql`insert into vertical_draft (place_id, agency_id, draft) values ('pl3', ${IDS.agencyA}, '{"sources":["a"]}'::jsonb)`);
    await create(adminB, { ...distillery, draftPlaceId: 'pl3' });
    const [v] = await q<{ draft_evidence: unknown }>(sql`select draft_evidence from vertical where id = 'distillery'`);
    expect(v!.draft_evidence).toEqual({ sources: ['a'] });
  });

  it('copies the agency’s draft evidence and re-keys the draft LLM spend', async () => {
    await dbs.owner.execute(sql`insert into vertical_draft (place_id, agency_id, draft) values ('pl1', ${IDS.agencyA}, '{"sources":["a"]}'::jsonb)`);
    await dbs.owner.execute(sql`insert into llm_call (agency_id, task, provider, model, input_tokens, output_tokens, latency_ms, ok, vertical_id) values (${IDS.agencyA}, 't', 'p', 'm', 1, 1, 1, true, 'draft:pl1')`);
    await create(admin, { ...distillery, draftPlaceId: 'pl1' });
    const [v] = await q<{ draft_evidence: unknown }>(sql`select draft_evidence from vertical where id = 'distillery'`);
    expect(v!.draft_evidence).toEqual({ sources: ['a'] });
    expect(await q(sql`select vertical_id from llm_call`)).toEqual([{ vertical_id: 'distillery' }]);
  });

  it('does not re-key another agency’s draft spend', async () => {
    await dbs.owner.execute(sql`insert into llm_call (agency_id, task, provider, model, input_tokens, output_tokens, latency_ms, ok, vertical_id) values (${IDS.agencyB}, 't', 'p', 'm', 1, 1, 1, true, 'draft:pl2')`);
    await create(admin, { ...distillery, draftPlaceId: 'pl2' });
    expect(await q(sql`select vertical_id from llm_call`)).toEqual([{ vertical_id: 'draft:pl2' }]);
  });

  it('concurrent identical creates yield one vertical and the same id', async () => {
    const [a, b] = await Promise.all([create(admin), create(admin)]);
    expect(a).toEqual(b);
    expect(await q(sql`select 1 from vertical where id like 'distill%'`)).toHaveLength(1);
  });

  it('concurrent similar-name creates by different agencies: one wins, the other gets a conflict', async () => {
    const r = await Promise.allSettled([create(admin), create(adminB, { ...distillery, name: 'Distillery', categories: ['Other category'] })]);
    expect(r.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    expect((r.find((x) => x.status === 'rejected') as PromiseRejectedResult).reason).toMatchObject({ code: 'conflict' });
  });

  it('is for agency staff only and refused in support sessions', async () => {
    await expect(create(viewer)).rejects.toMatchObject({ code: expect.stringMatching(/permission_denied|not_found/) });
    await expect(create(ctx('agency_admin', IDS.agencyA, true))).rejects.toMatchObject({ code: 'read_only_session' });
    expect((await create(am)).verticalId).toBe('distillery');
  });
});

describe('add_business_area', () => {
  it('adds an unreviewed area, idempotently by name, and the pack picks it up', async () => {
    const out = (await registry.invoke(am, 'add_business_area', { verticalId: 'dental', name: 'Teeth Alignment', aliases: ['braces'] })) as { verticalId: string; areaId: string };
    expect(out).toEqual({ verticalId: 'dental', areaId: 'teeth_alignment' });
    expect(await registry.invoke(am, 'add_business_area', { verticalId: 'dental', name: 'teeth alignments' })).toEqual(out);
    const rows = await q<{ status: string; created_by_agency_id: string }>(sql`select status, created_by_agency_id from business_area where vertical_id = 'dental' and id = 'teeth_alignment'`);
    expect(rows).toEqual([{ status: 'unreviewed', created_by_agency_id: IDS.agencyA }]);
    expect((await catalog.packs('dental')).services.some((s) => s.id === 'teeth_alignment')).toBe(true);
  });

  it('concurrent adds of the same name give one area and the same id', async () => {
    const add = () => registry.invoke(am, 'add_business_area', { verticalId: 'dental', name: 'Teeth Alignment' });
    const [a, b] = await Promise.all([add(), add()]);
    expect(a).toEqual(b);
    expect(await q(sql`select 1 from business_area where vertical_id = 'dental' and id like 'teeth_align%'`)).toHaveLength(1);
  });

  it('resolves a merged vertical id to its target', async () => {
    await dbs.owner.execute(sql`insert into vertical (id, name, status, merged_into) values ('old_dental', 'Old dental', 'merged', 'dental')`);
    expect(await registry.invoke(am, 'add_business_area', { verticalId: 'old_dental', name: 'Teeth Alignment' })).toEqual({ verticalId: 'dental', areaId: 'teeth_alignment' });
  });

  it('refuses unknown or generic verticals and client data in the name', async () => {
    await expect(registry.invoke(am, 'add_business_area', { verticalId: 'nope', name: 'Whatever' })).rejects.toMatchObject({ code: 'invalid_input' });
    await expect(registry.invoke(am, 'add_business_area', { verticalId: 'generic', name: 'Whatever' })).rejects.toMatchObject({ code: 'invalid_input' });
    await expect(registry.invoke(am, 'add_business_area', { verticalId: 'dental', name: 'Call 512-555-0147' })).rejects.toMatchObject({ code: 'invalid_input' });
  });
});

describe('update_vertical', () => {
  it('bumps the version, rewrites categories and areas', async () => {
    await create(admin);
    const out = await registry.invoke(admin, 'update_vertical', {
      verticalId: 'distillery', audienceNoun: 'visitors', categories: ['Distillery', 'Bourbon distillery'], relatedCategories: [],
      areas: [{ id: 'tasting_room', name: 'Tasting rooms' }, { name: 'Gift shop' }],
    });
    expect(out).toEqual({ verticalId: 'distillery', version: 2 });
    expect((await q<{ gbp_categories: string[]; gbp_related_categories: string[] }>(sql`select gbp_categories, gbp_related_categories from vertical where id = 'distillery'`))[0])
      .toEqual({ gbp_categories: ['distillery', 'bourbon distillery'], gbp_related_categories: [] });
    expect((await q(sql`select 1 from vertical_category where vertical_id = 'distillery'`))).toHaveLength(2);
    const pack = await catalog.packs('distillery');
    expect(pack).toMatchObject({ version: 2, audience_noun: 'visitors' });
    expect(pack.services.map((s) => `${s.id}:${s.name}`).sort()).toEqual(['gift_shop:Gift shop', 'tasting_room:Tasting rooms']);
  });

  it('refuses removing an area that clients use', async () => {
    await create(admin);
    await dbs.owner.execute(sql`update client set vertical_id = 'distillery', services = '["bottle_sales"]'::jsonb where id = ${IDS.clientA1}`);
    await expect(registry.invoke(admin, 'update_vertical', { verticalId: 'distillery', areas: [{ id: 'tasting_room', name: 'Tasting room' }] })).rejects.toMatchObject({
      code: 'invalid_input', message: 'Clients use Bottle sales. Ask the platform team to merge it instead.',
    });
    expect((await q(sql`select 1 from business_area where vertical_id = 'distillery'`))).toHaveLength(2);
  });

  it('refuses a result that would not validate (no areas left)', async () => {
    await create(admin);
    await expect(registry.invoke(admin, 'update_vertical', { verticalId: 'distillery', areas: [] })).rejects.toMatchObject({ code: 'invalid_input' });
  });

  it('is only for the creating agency while unreviewed (permission_denied)', async () => {
    await create(admin);
    await expect(registry.invoke(adminB, 'update_vertical', { verticalId: 'distillery', name: 'Hijack' })).rejects.toMatchObject({ code: 'permission_denied' });
    await expect(registry.invoke(admin, 'update_vertical', { verticalId: 'dental', name: 'Hijack' })).rejects.toMatchObject({ code: 'permission_denied' });
    await dbs.owner.execute(sql`update vertical set status = 'reviewed' where id = 'distillery'`);
    await expect(registry.invoke(admin, 'update_vertical', { verticalId: 'distillery', name: 'Late edit' })).rejects.toMatchObject({ code: 'permission_denied' });
  });
});

describe('list_verticals', () => {
  it('lists selectable verticals, hiding merged and generic', async () => {
    await dbs.owner.execute(sql`insert into vertical (id, name, status, merged_into) values ('old_dental', 'Old dental', 'merged', 'dental')`);
    const out = (await registry.invoke(am, 'list_verticals', {})) as { verticals: { id: string; status: string; services: unknown[] }[] };
    expect(out.verticals.map((v) => v.id).sort()).toEqual(['dental', 'hvac_plumbing']);
    expect(out.verticals[0]!.services.length).toBeGreaterThan(0);
  });
});

describe('draft_vertical', () => {
  const sample = {
    name: 'Craft distilleries', audienceNoun: 'guests',
    areas: [{ name: 'Tastings', aliases: [], quote: 'barrel tastings' }],
    seedKeywords: [], categories: ['Distillery'], relatedCategories: [], topics: [],
  };
  let calls: { placeId: string; nearbyCategories: string[] }[] = [];
  let behaviour: () => Promise<{ draft: typeof sample | null; similar: { id: string; name: string }[] }> = async () => ({ draft: sample, similar: [] });
  const drafting = createToolRegistry(
    { app: dbs.app, service: dbs.service, catalog, verticalDrafter: async (input, scope) => {
      calls.push(input);
      // The real drafter's ai.chat writes an llm_call row; simulate it so the attempt cap has something to count.
      await dbs.owner.execute(sql`insert into llm_call (agency_id, task, provider, model, input_tokens, output_tokens, latency_ms, ok, vertical_id) values (${scope.agencyId}, 'vertical_draft', 'p', 'm', 1, 1, 1, true, ${scope.verticalId})`);
      return behaviour();
    } },
    { audit: { record: async () => {} } },
  );
  type Out = { draft: unknown; similar: unknown[]; cached: boolean };
  const draft = (c: AccessContext, placeId: string) => drafting.invoke(c, 'draft_vertical', { placeId, nearbyCategories: ['Distillery'] }) as Promise<Out>;
  beforeEach(() => {
    calls = [];
    behaviour = async () => ({ draft: sample, similar: [] });
  });

  it('stores a non-null draft and answers the second call from the cache without calling the drafter', async () => {
    expect(await draft(admin, 'p1')).toEqual({ draft: sample, similar: [], cached: false });
    expect(await draft(admin, 'p1')).toMatchObject({ draft: sample, cached: true });
    expect(calls).toHaveLength(1);
  });

  it('does not store a null draft, so a retry calls the drafter again', async () => {
    behaviour = async () => ({ draft: null, similar: [] });
    expect(await draft(admin, 'p2')).toEqual({ draft: null, similar: [], cached: false });
    await draft(admin, 'p2');
    expect(calls).toHaveLength(2);
    expect(await q(sql`select 1 from vertical_draft`)).toHaveLength(0);
  });

  it('refuses the 11th attempt in a UTC day with a user-facing rate_limited, counting null drafts', async () => {
    await draft(admin, 'p0');
    behaviour = async () => ({ draft: null, similar: [] });
    for (let i = 1; i < 10; i++) await draft(admin, `p${i}`);
    await expect(draft(admin, 'p-extra')).rejects.toMatchObject({ code: 'rate_limited', userFacing: true, message: "You've drafted 10 new business types today. Try again tomorrow." });
    expect(calls).toHaveLength(10);
    expect((await draft(admin, 'p0')).cached).toBe(true); // a cache hit at the cap is still free
    await expect(draft(adminB, 'p-b')).resolves.toMatchObject({ cached: false });
  });

  it('turns a drafter failure into draft: null', async () => {
    behaviour = async () => { throw new Error('model down'); };
    expect(await draft(admin, 'p9')).toEqual({ draft: null, similar: [], cached: false });
  });

  it('is for agency staff and refused in support sessions', async () => {
    await expect(draft(viewer, 'p1')).rejects.toMatchObject({ code: expect.stringMatching(/permission_denied|not_found/) });
    await expect(draft(ctx('agency_admin', IDS.agencyA, true), 'p1')).rejects.toMatchObject({ code: 'read_only_session' });
    expect(calls).toHaveLength(0);
  });

  it('caches by place across agencies (the draft comes from a public profile only)', async () => {
    await draft(admin, 'shared');
    await expect(draft(adminB, 'shared')).resolves.toMatchObject({ cached: true });
  });
});
