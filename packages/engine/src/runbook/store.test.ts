import { client, playbookOverride, runbook, runbookItem } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { loadVerticalPack, type VerticalPack } from '@cs/verticals';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveLegacyPlaybooks } from '../briefs/playbooks';
import { copyItems, createClientRunbook, ensureAgencyRunbook, ensurePlatformRunbook, itemsFromPack, loadClientRunbook, readRunbookItems, writeItem, type RunbookItem } from './index';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const db = dbs.service;

let generic: VerticalPack;
let hvac: VerticalPack;
beforeAll(async () => {
  generic = await loadVerticalPack('generic');
  hvac = await loadVerticalPack('hvac_plumbing');
});
beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
  await dbs.owner.delete(runbook);
});

// A vertical id the catalogue could hold whose pack carries the generic plays; hvac_plumbing is the real own-plays pack.
const deps = () => ({
  db,
  packs: async (id: string) => (id === 'hvac_plumbing' ? hvac : { ...generic, id }),
  generic: async () => generic,
});
const base = (key: string, o: Partial<RunbookItem> = {}): RunbookItem => ({
  key, kind: 'play', content: { trigger: 'price_change', title: 'Own', template: 'x {{competitor}}' }, enabled: true, businessAreaIds: null,
  version: 1, upstreamVersion: null, upstreamSnapshot: null, dismissedUpstreamVersion: null, customised: false, removedUpstream: false, ...o,
});

describe('ensure*', () => {
  it('platform runbook holds the generic items plus knob:thresholds; idempotent under concurrency', async () => {
    const ids = await Promise.all([ensurePlatformRunbook(db, generic), ensurePlatformRunbook(db, generic)]);
    expect(ids[0]).toBe(ids[1]);
    expect(await dbs.owner.select().from(runbook)).toHaveLength(1);
    const items = await readRunbookItems(db, ids[0]);
    expect(items.length).toBe(itemsFromPack(generic).length + 1);
    expect(items.find((i) => i.key === 'knob:thresholds')?.content).toEqual({ alert: generic.scoring.routing.alert, brief: generic.scoring.routing.brief });
  });

  it('agency runbook copies the platform with provenance; idempotent under concurrency', async () => {
    const ids = await Promise.all([ensureAgencyRunbook(db, IDS.agencyA, generic), ensureAgencyRunbook(db, IDS.agencyA, generic)]);
    expect(ids[0]).toBe(ids[1]);
    expect(await dbs.owner.select().from(runbook).where(eq(runbook.agencyId, IDS.agencyA))).toHaveLength(1);
    expect(await dbs.owner.select().from(runbook)).toHaveLength(2);
    const items = await readRunbookItems(db, ids[0]);
    expect(items.length).toBe(itemsFromPack(generic).length + 1);
    expect(items.every((i) => i.upstreamVersion === 1 && i.version === 1 && !i.customised)).toBe(true);
  });

  it('createClientRunbook stores the items once', async () => {
    const id = await createClientRunbook(db, IDS.clientA1, [base('play:a')], 'u1');
    expect(await createClientRunbook(db, IDS.clientA1, [base('play:b')], 'u1')).toBe(id);
    expect((await readRunbookItems(db, id)).map((i) => i.key)).toEqual(['play:a']);
  });
});

describe('writeItem', () => {
  it('bumps version and flags customised only when different from the upstream snapshot', async () => {
    const id = await ensureAgencyRunbook(db, IDS.agencyA, generic);
    const [first] = (await readRunbookItems(db, id)).filter((i) => i.kind === 'play');
    await writeItem(db, id, { ...first!, content: { ...(first!.content as object), title: 'Changed' } }, 'u1');
    let [row] = (await readRunbookItems(db, id)).filter((i) => i.key === first!.key);
    expect(row).toMatchObject({ version: 2, customised: true });
    await writeItem(db, id, { ...row!, content: first!.content }, 'u1');
    [row] = (await readRunbookItems(db, id)).filter((i) => i.key === first!.key);
    expect(row).toMatchObject({ version: 3, customised: false });
    await writeItem(db, id, base('play:new'), 'u1');
    expect((await readRunbookItems(db, id)).find((i) => i.key === 'play:new')?.version).toBe(1);
  });
});

describe('loadClientRunbook order', () => {
  it('1: client runbook wins', async () => {
    await ensureAgencyRunbook(db, IDS.agencyA, generic);
    await createClientRunbook(db, IDS.clientA1, [base('play:mine')], 'u1');
    const e = await loadClientRunbook(deps(), IDS.clientA1);
    expect(e.source).toBe('client');
    expect(e.plays.map((p) => p.id)).toEqual(['mine']);
  });

  it('2: agency overrides for the vertical keep legacy even with a generic-play pack and an agency runbook', async () => {
    await ensureAgencyRunbook(db, IDS.agencyA, generic);
    await db.insert(playbookOverride).values({ agencyId: IDS.agencyA, verticalId: 'catalogue_x', playbookId: generic.playbooks[0]!.id, title: 'Over', template: 'Over {{service}}', updatedBy: 'u' });
    await dbs.owner.update(client).set({ verticalId: 'catalogue_x' }).where(eq(client.id, IDS.clientA1));
    const e = await loadClientRunbook(deps(), IDS.clientA1);
    expect(e.source).toBe('legacy');
    expect(e.plays.find((p) => p.id === generic.playbooks[0]!.id)).toMatchObject({ title: 'Over', source: 'agency' });
    expect(e.selfRules).toEqual({ ...generic, id: 'catalogue_x' }.self_rules);
  });

  it('3: agency runbook used for a generic-play pack without overrides', async () => {
    const id = await ensureAgencyRunbook(db, IDS.agencyA, generic);
    const play = (await readRunbookItems(db, id)).find((i) => i.kind === 'play')!;
    await writeItem(db, id, { ...play, content: { ...(play.content as object), title: 'Agency title' } }, 'u1');
    await dbs.owner.update(client).set({ verticalId: 'catalogue_x' }).where(eq(client.id, IDS.clientA1));
    const e = await loadClientRunbook(deps(), IDS.clientA1);
    expect(e.source).toBe('agency');
    expect(e.plays.find((p) => `play:${p.id}` === play.key)).toMatchObject({ title: 'Agency title', version: 2 });
  });

  it('3 (pre-flight ruling): an HVAC client with an agency runbook and no client runbook resolves to unchanged legacy output', async () => {
    await ensureAgencyRunbook(db, IDS.agencyA, generic);
    const e = await loadClientRunbook(deps(), IDS.clientA1);
    expect(e.source).toBe('legacy');
    const legacy = await resolveLegacyPlaybooks(db, IDS.agencyA, hvac);
    expect(e.plays).toEqual(legacy.map((p) => ({ ...p, version: 0, businessAreaIds: null })));
    expect(e.selfRules).toEqual(hvac.self_rules);
  });

  it('4: no runbooks at all is legacy pack-only', async () => {
    const e = await loadClientRunbook(deps(), IDS.clientA1);
    expect(e.source).toBe('legacy');
    expect(e.plays).toHaveLength(hvac.playbooks.length);
    expect(e.focusAreaIds).toEqual([]);
    expect(e.tierLimits).toBeNull();
  });

  it('skips an invalid stored item with a warning', async () => {
    const id = await createClientRunbook(db, IDS.clientA1, [base('play:ok'), base('play:bad', { content: { trigger: 'nope' } })], 'u1');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const e = await loadClientRunbook(deps(), IDS.clientA1);
    expect(e.plays.map((p) => p.id)).toEqual(['ok']);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('play:bad'));
    warn.mockRestore();
    expect(await db.select().from(runbookItem).where(eq(runbookItem.runbookId, id))).toHaveLength(2);
  });

  it('propagates a database error', async () => {
    await expect(loadClientRunbook(deps(), '00000000-0000-4000-8000-00000000dead')).rejects.toThrow();
  });
});

describe('thresholds (R3)', () => {
  const knob = (alert: number, brief: number) => base('knob:thresholds', { kind: 'knob', content: { alert, brief } });
  it('client column, then agency knob, then platform knob, then pack routing', async () => {
    expect((await loadClientRunbook(deps(), IDS.clientA1)).thresholds).toEqual({ alert: hvac.scoring.routing.alert, brief: hvac.scoring.routing.brief });
    const platformId = await ensurePlatformRunbook(db, generic);
    await writeItem(db, platformId, knob(75, 45), 'u');
    expect((await loadClientRunbook(deps(), IDS.clientA1)).thresholds).toEqual({ alert: 75, brief: 45 });
    const agencyId = await ensureAgencyRunbook(db, IDS.agencyA, generic);
    await writeItem(db, agencyId, { ...copyItems([knob(75, 45)])[0]!, content: { alert: 80, brief: 50 } }, 'u');
    expect((await loadClientRunbook(deps(), IDS.clientA1)).thresholds).toEqual({ alert: 80, brief: 50 });
    await dbs.owner.update(client).set({ scoreThresholds: { alert: 90, brief: 60 } }).where(eq(client.id, IDS.clientA1));
    expect((await loadClientRunbook(deps(), IDS.clientA1)).thresholds).toEqual({ alert: 90, brief: 60 });
    await createClientRunbook(db, IDS.clientA1, [base('play:mine')], 'u1');
    expect((await loadClientRunbook(deps(), IDS.clientA1)).thresholds).toEqual({ alert: 90, brief: 60 });
  });
});

describe('tier limits (R5)', () => {
  const tiers = (o: number) => ({ top: { overlap: o, activity: 0.25 }, watch: { overlap: 0.35, activity: 0.6 } });
  const tierKnob = (o: number, enabled = true) => base('knob:tier_limits', { kind: 'knob', content: tiers(o), enabled });
  it('client knob, then agency knob, then null - in the client and the legacy branches', async () => {
    expect((await loadClientRunbook(deps(), IDS.clientA1)).tierLimits).toBeNull();
    const agencyId = await ensureAgencyRunbook(db, IDS.agencyA, generic);
    await writeItem(db, agencyId, tierKnob(0.5), 'u');
    expect((await loadClientRunbook(deps(), IDS.clientA1)).tierLimits).toEqual(tiers(0.5)); // legacy branch
    await createClientRunbook(db, IDS.clientA1, [base('play:mine')], 'u1');
    expect((await loadClientRunbook(deps(), IDS.clientA1)).tierLimits).toEqual(tiers(0.5)); // client runbook without a knob
    const [rb] = await db.select({ id: runbook.id }).from(runbook).where(eq(runbook.clientId, IDS.clientA1));
    await writeItem(db, rb!.id, tierKnob(0.7), 'u');
    expect((await loadClientRunbook(deps(), IDS.clientA1)).tierLimits).toEqual(tiers(0.7));
    await writeItem(db, rb!.id, tierKnob(0.7, false), 'u');
    expect((await loadClientRunbook(deps(), IDS.clientA1)).tierLimits).toEqual(tiers(0.5)); // disabled client knob falls to the agency
  });
});
