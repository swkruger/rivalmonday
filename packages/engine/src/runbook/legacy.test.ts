import { client, playbookOverride, runbook } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { loadVerticalPack, type VerticalPack } from '@cs/verticals';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { compareWithParent, ensureAgencyRunbook, legacyClientItems, readRunbookItems } from './index';

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
  await dbs.owner.update(client).set({ verticalId: 'hvac_plumbing' }).where(eq(client.id, IDS.clientA1));
});
const packs = async () => hvac;
const agencyItems = async () => readRunbookItems(db, await ensureAgencyRunbook(db, IDS.agencyA, generic));

describe('legacyClientItems', () => {
  it('carries the pack plays and self rules, no knobs, no AI', async () => {
    const items = await legacyClientItems({ db, packs }, IDS.clientA1, await agencyItems());
    expect(items.filter((i) => i.kind === 'play').map((i) => i.key).sort()).toEqual(hvac.playbooks.map((p) => `play:${p.id}`).sort());
    expect(items.filter((i) => i.kind === 'self_rule')).toHaveLength(hvac.self_rules.length);
    expect(items.some((i) => i.kind === 'knob')).toBe(false);
  });

  it('applies an override, carries a disabled play, and flags customised against the agency content', async () => {
    const shared = hvac.playbooks.filter((p) => generic.playbooks.some((g) => g.id === p.id));
    const [a, b] = shared;
    expect(a && b).toBeTruthy();
    await dbs.owner.insert(playbookOverride).values([
      { agencyId: IDS.agencyA, verticalId: 'hvac_plumbing', playbookId: a!.id, title: 'Edited title', template: null, updatedBy: 'u' },
      { agencyId: IDS.agencyA, verticalId: 'hvac_plumbing', playbookId: b!.id, title: null, template: null, disabledBy: 'u', updatedBy: 'u' },
    ]);
    const items = await legacyClientItems({ db, packs }, IDS.clientA1, await agencyItems());
    const ia = items.find((i) => i.key === `play:${a!.id}`)!;
    expect((ia.content as { title: string }).title).toBe('Edited title');
    expect(ia.customised).toBe(true);
    expect(items.find((i) => i.key === `play:${b!.id}`)!.enabled).toBe(false);
  });

  it('shared ids take the agency version/snapshot; pack-only ids are client-owned; generic-only ids show as new_upstream', async () => {
    const agency = await agencyItems();
    const items = await legacyClientItems({ db, packs }, IDS.clientA1, agency);
    const sharedItem = items.find((i) => agency.some((g) => g.key === i.key));
    if (sharedItem) {
      const parent = agency.find((g) => g.key === sharedItem.key)!;
      expect(sharedItem.upstreamVersion).toBe(parent.version);
      expect(sharedItem.upstreamSnapshot).toEqual({ content: parent.content, enabled: parent.enabled, businessAreaIds: parent.businessAreaIds });
    }
    const packOnly = items.filter((i) => !agency.some((g) => g.key === i.key));
    for (const p of packOnly) expect(p.upstreamVersion).toBeNull();
    const states = compareWithParent(items, agency);
    for (const p of packOnly) expect(states.find((s) => s.key === p.key)?.state).toBe('in_sync');
    for (const g of agency.filter((x) => x.kind !== 'knob' && !items.some((i) => i.key === x.key))) {
      expect(states.find((s) => s.key === g.key)?.state).toBe('new_upstream');
    }
  });
});
