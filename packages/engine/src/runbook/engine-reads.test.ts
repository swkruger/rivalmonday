import { client, playbookOverride, runbook } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { loadVerticalPack, type VerticalPack } from '@cs/verticals';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { BriefClient, EventCandidate } from '../briefs/gather';
import { playbookRef, resolveLegacyPlaybooks } from '../briefs/playbooks';
import { recommendationFromItem } from '../briefs/recommendations';
import { buildWriterPrompt } from '../briefs/writer';
import { copyItems, createClientRunbook, ensureAgencyRunbook, itemsFromPack, legacyClientItems, loadClientRunbook, readRunbookItems, type RunbookItem } from './index';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const db = dbs.service;

let generic: VerticalPack;
const packs: Record<string, VerticalPack> = {};
beforeAll(async () => {
  generic = await loadVerticalPack('generic');
  for (const id of ['hvac_plumbing', 'dental']) packs[id] = await loadVerticalPack(id);
});
beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
  await dbs.owner.delete(runbook);
});
const deps = () => ({ db, packs: async (id: string) => packs[id]!, generic: async () => generic });

const CLIENTS = [
  { label: 'HVAC', id: IDS.clientA1, vertical: 'hvac_plumbing' },
  { label: 'dental', id: IDS.clientA2, vertical: 'dental' },
] as const;

/** The pack's items copied the way a client copy is made, then the agency's `playbook_override` rows applied (pre-flight ruling: inline, no Task 7). */
async function inlineClientCopy(vertical: string): Promise<RunbookItem[]> {
  const asItems: RunbookItem[] = itemsFromPack(packs[vertical]!).map((i) => ({
    ...i, version: 1, upstreamVersion: null, upstreamSnapshot: null, dismissedUpstreamVersion: null, customised: false, removedUpstream: false,
  }));
  const overrides = await db.select().from(playbookOverride).where(eq(playbookOverride.verticalId, vertical));
  return copyItems(asItems).map((i) => {
    const o = overrides.find((x) => `play:${x.playbookId}` === i.key);
    if (!o) return i;
    if (o.disabledBy) return { ...i, enabled: false };
    return { ...i, content: { ...(i.content as object), ...(o.title ? { title: o.title } : {}), ...(o.template ? { template: o.template } : {}) } };
  });
}
const byId = <T extends { id: string }>(xs: T[]) => [...xs].sort((a, b) => a.id.localeCompare(b.id));
const playShape = (p: { id: string; trigger: string; title: string; template: string; effort?: string; impact?: string }) =>
  ({ id: p.id, trigger: p.trigger, title: p.title, template: p.template, effort: p.effort, impact: p.impact });

describe.each(CLIENTS)('golden equivalence ($label)', ({ id, vertical }) => {
  for (const withOverride of [false, true]) {
    it(`legacy path and a client runbook copy agree ${withOverride ? 'with' : 'without'} a playbook_override`, async () => {
      const pack = packs[vertical]!;
      if (withOverride) {
        await db.insert(playbookOverride).values([
          { agencyId: IDS.agencyA, verticalId: vertical, playbookId: pack.playbooks[0]!.id, title: 'Custom title', template: 'Custom {{competitor}}', updatedBy: 'u1' },
          { agencyId: IDS.agencyA, verticalId: vertical, playbookId: pack.playbooks[1]!.id, disabledBy: 'u1', updatedBy: 'u1' },
        ]);
      }
      const legacy = await loadClientRunbook(deps(), id);
      expect(legacy.source).toBe('legacy');
      const legacyPlays = await resolveLegacyPlaybooks(db, IDS.agencyA, pack);
      expect(byId(legacy.plays).map(playShape)).toEqual(byId(legacyPlays).map(playShape));
      expect(legacy.plays.length).toBe(pack.playbooks.length - (withOverride ? 1 : 0));

      await createClientRunbook(db, id, await inlineClientCopy(vertical), 'u1');
      const copy = await loadClientRunbook(deps(), id);
      expect(copy.source).toBe('client');
      expect(byId(copy.plays).map(playShape)).toEqual(byId(legacy.plays).map(playShape));
      expect([...copy.selfRules].sort((a, b) => a.id.localeCompare(b.id))).toEqual([...legacy.selfRules].sort((a, b) => a.id.localeCompare(b.id)));
      expect(copy.thresholds).toEqual(legacy.thresholds);
      expect(copy.thresholds).toEqual({ alert: pack.scoring.routing.alert, brief: pack.scoring.routing.brief });
    });
  }

  for (const withOverride of [false, true]) {
    it(`a legacyClientItems backfill equals the legacy view ${withOverride ? 'with' : 'without'} a playbook_override`, async () => {
      const pack = packs[vertical]!;
      if (withOverride) {
        await db.insert(playbookOverride).values([
          { agencyId: IDS.agencyA, verticalId: vertical, playbookId: pack.playbooks[0]!.id, title: 'Custom title', template: 'Custom {{competitor}}', updatedBy: 'u1' },
          { agencyId: IDS.agencyA, verticalId: vertical, playbookId: pack.playbooks[1]!.id, disabledBy: 'u1', updatedBy: 'u1' },
        ]);
      }
      const legacy = await loadClientRunbook(deps(), id);
      expect(legacy.source).toBe('legacy');
      const agencyItems = await readRunbookItems(db, await ensureAgencyRunbook(db, IDS.agencyA, generic));
      await createClientRunbook(db, id, await legacyClientItems({ db, packs: deps().packs }, id, agencyItems), 'u1');
      const copy = await loadClientRunbook(deps(), id);
      expect(copy.source).toBe('client');
      expect(byId(copy.plays).map(playShape)).toEqual(byId(legacy.plays).map(playShape));
      expect([...copy.selfRules].sort((a, b) => a.id.localeCompare(b.id))).toEqual([...legacy.selfRules].sort((a, b) => a.id.localeCompare(b.id)));
      expect(copy.thresholds).toEqual(legacy.thresholds);
    });
  }

  it('an agency runbook without a client runbook leaves output identical to the legacy view', async () => {
    const before = await loadClientRunbook(deps(), id);
    await ensureAgencyRunbook(db, IDS.agencyA, generic);
    expect(await loadClientRunbook(deps(), id)).toEqual(before);
  });
});

describe('what the runbook changes', () => {
  const bc: BriefClient = {
    id: IDS.clientA1, agencyId: IDS.agencyA, name: 'A1 HVAC', verticalId: 'hvac_plumbing', verticalName: 'HVAC', services: [], serviceNames: [],
    towns: [], zips: [], competitorNames: ['Smith HVAC'], briefThreshold: 40,
  };
  const cand: EventCandidate = {
    kind: 'event', eventId: 'e1', competitorId: 'x', competitorName: 'Smith HVAC', changeType: 'price_change', score: 60, route: 'brief', occurredAt: new Date('2026-09-30T06:00:00Z'),
    confidence: 0.9, summary: 'price changed', facts: [], zips: [], details: {}, serviceId: null, serviceName: null, changes: [],
  };
  const period = { start: new Date('2026-09-25T03:00:00Z'), end: new Date('2026-10-02T03:00:00Z') };
  const priceIdx = (items: RunbookItem[]) => items.findIndex((i) => i.kind === 'play' && (i.content as { trigger: string }).trigger === 'price_change');

  it('a customised play changes the brief prompt text', async () => {
    const items = await inlineClientCopy('hvac_plumbing');
    const idx = priceIdx(items);
    items[idx] = { ...items[idx]!, content: { ...(items[idx]!.content as object), template: 'Runbook says: match {{competitor}} quietly.' } };
    const prompt = (plays: Awaited<ReturnType<typeof loadClientRunbook>>['plays']) => buildWriterPrompt(bc, [cand], plays, period).messages[1]!.content ?? '';
    expect(prompt((await loadClientRunbook(deps(), IDS.clientA1)).plays)).not.toContain('Runbook says');
    await createClientRunbook(db, IDS.clientA1, items, 'u1');
    expect(prompt((await loadClientRunbook(deps(), IDS.clientA1)).plays)).toContain('Runbook says: match Smith HVAC quietly.');
  });

  it('an area-limited play is skipped for a client without that area', async () => {
    const items = await inlineClientCopy('hvac_plumbing');
    const idx = priceIdx(items);
    const playId = items[idx]!.key.replace(/^play:/, '');
    items[idx] = { ...items[idx]!, businessAreaIds: ['water_heater'] };
    await createClientRunbook(db, IDS.clientA1, items, 'u1');
    await db.update(client).set({ services: ['ac_tune_up'] }).where(eq(client.id, IDS.clientA1));
    expect((await loadClientRunbook(deps(), IDS.clientA1)).plays.some((p) => p.id === playId)).toBe(false);
    await db.update(client).set({ services: ['water_heater'] }).where(eq(client.id, IDS.clientA1));
    expect((await loadClientRunbook(deps(), IDS.clientA1)).plays.some((p) => p.id === playId)).toBe(true);
  });

  it('playbook_version is stored for runbook plays and left null for legacy ones', async () => {
    await createClientRunbook(db, IDS.clientA1, await inlineClientCopy('hvac_plumbing'), 'u1');
    const e = await loadClientRunbook(deps(), IDS.clientA1);
    expect(playbookRef(e.plays, cand)).toEqual({ playbookId: expect.any(String), playbookVersion: 1 });
    const legacy = await loadClientRunbook(deps(), IDS.clientA2);
    expect(playbookRef(legacy.plays, cand).playbookVersion).toBeNull();
    expect(recommendationFromItem({ playbookId: 'p', playbookVersion: 3, evidenceIds: [], eventIds: [], recommendedAction: 'a', headline: 'h', whatChanged: 'w' } as never).playbookVersion).toBe(3);
  });
});
