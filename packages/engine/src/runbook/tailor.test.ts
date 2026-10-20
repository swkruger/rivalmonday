import { client, runbook, runbookItem } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { loadVerticalPack, type VerticalPack } from '@cs/verticals';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createFakeAi } from '../../test/fake-ai';
import { applyTailoring, createClientRunbook, ensureAgencyRunbook, proposeTailoring, readRunbookItems, tailorClientRunbook, type RunbookItem } from './index';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const db = dbs.service;

const play = (key: string, content: Record<string, unknown>, o: Partial<RunbookItem> = {}): RunbookItem => ({
  key, kind: 'play', content, enabled: true, businessAreaIds: null, version: 1, upstreamVersion: 3,
  upstreamSnapshot: { content, enabled: true, businessAreaIds: null }, dismissedUpstreamVersion: null, customised: false, removedUpstream: false, ...o,
});
const BASE = play('play:a', { trigger: 'price_change', title: 'Respond to {{competitor}}', template: 'Look at {{competitor}} on {{service}}.', effort: 'M' });
const ctx = { areaIds: ['ac_repair', 'furnace'] };
const out = (o: Record<string, unknown>) => ({ items: [{ key: 'play:a', title: 'New title', template: 'Hold on {{service}} versus {{competitor}}.', businessAreaIds: null, ...o }] });

describe('applyTailoring', () => {
  it('accepts a valid rewrite, keeping trigger/effort, the agency snapshot and customised=false', () => {
    const r = applyTailoring([BASE], out({ businessAreaIds: ['ac_repair'] }), ctx);
    expect(r.rejected).toEqual([]);
    const it0 = r.items[0]!;
    expect(it0.content).toEqual({ trigger: 'price_change', title: 'New title', template: 'Hold on {{service}} versus {{competitor}}.', effort: 'M' });
    expect(it0.businessAreaIds).toEqual(['ac_repair']);
    expect(it0.upstreamSnapshot).toEqual(BASE.upstreamSnapshot);
    expect(it0.customised).toBe(false);
  });
  it('rejects an unknown or added placeholder', () => {
    expect(applyTailoring([BASE], out({ template: 'x {{bogus}}' }), ctx).rejected).toEqual(['play:a']);
    expect(applyTailoring([BASE], out({ template: 'x {{theme}}' }), ctx).rejected).toEqual(['play:a']); // valid var, but not in the base
  });
  it('rejects a title with {{', () => {
    const r = applyTailoring([BASE], out({ title: 'Hi {{competitor}}' }), ctx);
    expect(r.rejected).toEqual(['play:a']);
    expect(r.items[0]).toEqual(BASE);
  });
  it('rejects an over-length template', () => {
    expect(applyTailoring([BASE], out({ template: 'x'.repeat(2001) }), ctx).rejected).toEqual(['play:a']);
  });
  it('rejects a foreign area id and an unknown or non-play key; an extra field fails the whole answer', () => {
    expect(applyTailoring([BASE], out({ businessAreaIds: ['nope'] }), ctx).rejected).toEqual(['play:a']);
    expect(applyTailoring([BASE], { items: [{ key: 'play:zzz', title: 't', template: 'x', businessAreaIds: null }] }, ctx).rejected).toEqual(['play:zzz']);
    const rule: RunbookItem = { ...BASE, key: 'self_rule:s', kind: 'self_rule' };
    expect(applyTailoring([rule], { items: [{ key: 'self_rule:s', title: 't', template: 'x', businessAreaIds: null }] }, ctx).rejected).toEqual(['self_rule:s']);
    const bad = applyTailoring([BASE], { items: [{ ...out({}).items[0], trigger: 'x' }] }, ctx);
    expect(bad.items).toEqual([BASE]);
    expect(bad.rejected).toEqual(['*']);
  });
  it('treats an empty area list as null (keeps the base restriction)', () => {
    expect(applyTailoring([BASE], out({ businessAreaIds: [] }), ctx).items[0]!.businessAreaIds).toBeNull();
  });
});

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
  await dbs.owner.update(client).set({ verticalId: 'hvac_plumbing', status: 'active', pausedAt: null }).where(eq(client.id, IDS.clientA1));
});

// hvac has its own plays (legacy base); the "generic" loader serves the generic plays under the hvac id (agency-runbook base).
const hvacPacks = async () => hvac;
const genericPacks = async () => ({ ...generic, id: 'hvac_plumbing' });
/** Rewrites every play listed in the prompt. */
const rewriteAll = () => createFakeAi({
  chat: (_t, content) => {
    const input = JSON.parse(content) as { plays: { key: string; title: string; template: string }[] };
    return JSON.stringify({ items: input.plays.map((p) => ({ key: p.key, title: `Tailored ${p.title}`.slice(0, 190), template: p.template, businessAreaIds: null })) });
  },
});
const clientRunbook = async () => (await dbs.owner.select().from(runbook).where(eq(runbook.clientId, IDS.clientA1)))[0];
const deps = (ai: ReturnType<typeof createFakeAi>, packs = hvacPacks) => ({ db, ai, packs, generic: async () => generic });

describe('tailorClientRunbook', () => {
  it('skips a paused client and a non-active client', async () => {
    const ai = rewriteAll();
    await dbs.owner.update(client).set({ pausedAt: new Date() }).where(eq(client.id, IDS.clientA1));
    expect((await tailorClientRunbook(deps(ai), IDS.clientA1)).status).toBe('skipped');
    await dbs.owner.update(client).set({ pausedAt: null, status: 'prospect' }).where(eq(client.id, IDS.clientA1));
    expect((await tailorClientRunbook(deps(ai), IDS.clientA1)).status).toBe('skipped');
    expect(ai.calls.chat).toHaveLength(0);
    expect(await clientRunbook()).toBeUndefined();
  });

  it('a pending runbook of a client that is no longer serviceable is stamped skipped', async () => {
    const ai = rewriteAll();
    await dbs.owner.update(client).set({ verticalId: 'hvac_plumbing' }).where(eq(client.id, IDS.clientA1));
    await tailorClientRunbook(deps(ai), IDS.clientA1);
    await dbs.owner.update(runbook).set({ tailorStatus: 'pending' }).where(eq(runbook.clientId, IDS.clientA1));
    await dbs.owner.update(client).set({ pausedAt: new Date() }).where(eq(client.id, IDS.clientA1));
    expect((await tailorClientRunbook(deps(ai), IDS.clientA1)).status).toBe('skipped');
    expect((await clientRunbook())!.tailorStatus).toBe('skipped');
  });

  it('a created generic-play runbook holds a set score_thresholds column as a customised knob', async () => {
    await dbs.owner.update(client).set({ scoreThresholds: { alert: 60, brief: 30 } }).where(eq(client.id, IDS.clientA1));
    await tailorClientRunbook(deps(rewriteAll(), genericPacks), IDS.clientA1);
    const items = await readRunbookItems(db, (await clientRunbook())!.id);
    expect(items.find((i) => i.key === 'knob:thresholds')).toMatchObject({ content: { alert: 60, brief: 30 }, enabled: true, customised: true });
  });

  it('AI failure writes the untailored copy with tailor_status failed', async () => {
    const ai = createFakeAi({ chat: () => { throw new Error('openrouter down'); } });
    expect((await tailorClientRunbook(deps(ai), IDS.clientA1)).status).toBe('failed');
    const rb = (await clientRunbook())!;
    expect(rb.tailorStatus).toBe('failed');
    const items = await readRunbookItems(db, rb.id);
    expect(items.filter((i) => i.kind === 'play').map((i) => (i.content as { title: string }).title).sort()).toEqual(hvac.playbooks.map((p) => p.title).sort());
  });

  it('an unparseable answer counts as a failure', async () => {
    const ai = createFakeAi({ chat: () => 'not json' });
    expect((await tailorClientRunbook(deps(ai), IDS.clientA1)).status).toBe('failed');
    expect((await clientRunbook())!.tailorStatus).toBe('failed');
  });

  it('success (pack with its own plays): tailored text, scope with verticalId, legacy base', async () => {
    const ai = rewriteAll();
    expect((await tailorClientRunbook(deps(ai), IDS.clientA1)).status).toBe('done');
    expect(ai.calls.chat[0]!.task).toBe('runbook_tailor');
    expect(ai.calls.chat[0]!.scope).toEqual({ agencyId: IDS.agencyA, clientId: IDS.clientA1, verticalId: 'hvac_plumbing' });
    const rb = (await clientRunbook())!;
    expect(rb.tailorStatus).toBe('done');
    expect(rb.tailoredAt).not.toBeNull();
    const items = await readRunbookItems(db, rb.id);
    const plays = items.filter((i) => i.kind === 'play');
    expect(plays).toHaveLength(hvac.playbooks.length);
    expect(plays.every((p) => (p.content as { title: string }).title.startsWith('Tailored '))).toBe(true);
    expect(plays.every((p) => !p.customised)).toBe(true);
  });

  it('success (generic plays): copies the agency runbook, snapshot = the agency content', async () => {
    const ai = rewriteAll();
    expect((await tailorClientRunbook(deps(ai, genericPacks), IDS.clientA1)).status).toBe('done');
    const agency = await readRunbookItems(db, await ensureAgencyRunbook(db, IDS.agencyA, generic));
    const items = await readRunbookItems(db, (await clientRunbook())!.id);
    const a = agency.find((i) => i.kind === 'play')!;
    const t = items.find((i) => i.key === a.key)!;
    expect((t.content as { title: string }).title).toBe(`Tailored ${(a.content as { title: string }).title}`.slice(0, 190));
    expect(t.upstreamVersion).toBe(a.version);
    expect(t.upstreamSnapshot).toEqual({ content: a.content, enabled: a.enabled, businessAreaIds: a.businessAreaIds });
    expect(items.some((i) => i.key === 'knob:thresholds')).toBe(true);
  });

  it('sends the area names and ids and redacts contact details', async () => {
    await dbs.owner.update(client).set({ services: [hvac.services[0]!.id] }).where(eq(client.id, IDS.clientA1));
    const ai = rewriteAll();
    await tailorClientRunbook(deps(ai), IDS.clientA1);
    const sent = JSON.parse(ai.calls.chat[0]!.content) as { areas: { id: string; name: string }[] };
    expect(sent.areas).toEqual([{ id: hvac.services[0]!.id, name: hvac.services[0]!.name }]);
  });

  it('never overwrites a customised item of a pending runbook', async () => {
    const first = createFakeAi({ chat: () => { throw new Error('down'); } });
    await tailorClientRunbook(deps(first), IDS.clientA1);
    const rb = (await clientRunbook())!;
    await dbs.owner.update(runbook).set({ tailorStatus: 'pending' }).where(eq(runbook.id, rb.id));
    const before = await readRunbookItems(db, rb.id);
    const target = before.find((i) => i.kind === 'play' && !i.customised)!;
    const free = before.filter((i) => i.kind === 'play' && !i.customised && i.key !== target.key).map((i) => i.key);
    expect(free.length).toBeGreaterThan(0); // legacy plays that differ from the agency's are customised already, so they stay too
    await dbs.owner.update(runbookItem).set({ customised: true, content: { ...(target.content as object), title: 'Mine' } })
      .where(and(eq(runbookItem.runbookId, rb.id), eq(runbookItem.itemKey, target.key)));
    expect((await tailorClientRunbook(deps(rewriteAll()), IDS.clientA1)).status).toBe('done');
    const after = await readRunbookItems(db, rb.id);
    expect((after.find((i) => i.key === target.key)!.content as { title: string }).title).toBe('Mine');
    expect(after.filter((i) => free.includes(i.key)).every((i) => (i.content as { title: string }).title.startsWith('Tailored '))).toBe(true);
    for (const i of before.filter((x) => x.customised)) expect(after.find((a) => a.key === i.key)!.content).toEqual(i.content);
    expect((await clientRunbook())!.tailorStatus).toBe('done');
  });

  it('a runbook created by another path while the model runs is left untouched (not mislabelled)', async () => {
    const manual: RunbookItem = { key: 'play:mine', kind: 'play', content: { trigger: 'price_change', title: 'Mine', template: 'x' }, enabled: true, businessAreaIds: null, version: 1, upstreamVersion: null, upstreamSnapshot: null, dismissedUpstreamVersion: null, customised: false, removedUpstream: false };
    const ai = createFakeAi({
      chat: (_t, content) => {
        void content;
        throw new Error('replaced below');
      },
    });
    const racing = {
      ...ai,
      chat: async (...args: Parameters<typeof ai.chat>) => {
        const id = await createClientRunbook(db, IDS.clientA1, [manual], 'u');
        await dbs.owner.update(runbook).set({ tailorStatus: 'skipped' }).where(eq(runbook.id, id));
        return rewriteAll().chat(...args);
      },
    } as unknown as ReturnType<typeof createFakeAi>;
    expect((await tailorClientRunbook(deps(racing), IDS.clientA1)).status).toBe('skipped');
    const rb = (await clientRunbook())!;
    expect(rb.tailorStatus).toBe('skipped');
    expect(rb.tailoredAt).toBeNull();
    expect((await readRunbookItems(db, rb.id)).map((i) => i.key)).toEqual(['play:mine']);
  });

  it('a runbook created meanwhile as pending gets the tailored plays it shares', async () => {
    const shared = hvac.playbooks[0]!;
    const mine: RunbookItem = { key: `play:${shared.id}`, kind: 'play', content: { trigger: shared.trigger, title: 'Mine', template: shared.template }, enabled: true, businessAreaIds: null, version: 1, upstreamVersion: null, upstreamSnapshot: null, dismissedUpstreamVersion: null, customised: false, removedUpstream: false };
    const inner = rewriteAll();
    const racing = {
      ...inner,
      chat: async (...args: Parameters<typeof inner.chat>) => {
        const id = await createClientRunbook(db, IDS.clientA1, [mine], 'u');
        await dbs.owner.update(runbook).set({ tailorStatus: 'pending' }).where(eq(runbook.id, id));
        return inner.chat(...args);
      },
    } as unknown as ReturnType<typeof createFakeAi>;
    expect((await tailorClientRunbook(deps(racing), IDS.clientA1)).status).toBe('done');
    const rb = (await clientRunbook())!;
    expect(rb.tailorStatus).toBe('done');
    const items = await readRunbookItems(db, rb.id);
    expect(items).toHaveLength(1);
    expect((items[0]!.content as { title: string }).title).toBe(`Tailored ${shared.title}`.slice(0, 190));
  });

  it('every play rejected individually is a failure, with the untailored copy written', async () => {
    const ai = createFakeAi({
      chat: (_t, content) => {
        const input = JSON.parse(content) as { plays: { key: string }[] };
        return JSON.stringify({ items: input.plays.map((p) => ({ key: p.key, title: 't', template: 'x {{bogus}}', businessAreaIds: null })) });
      },
    });
    const r = await tailorClientRunbook(deps(ai), IDS.clientA1);
    expect(r.status).toBe('failed');
    expect(r.rejected).toHaveLength(hvac.playbooks.length);
    const rb = (await clientRunbook())!;
    expect(rb.tailorStatus).toBe('failed');
    expect((await readRunbookItems(db, rb.id)).filter((i) => i.kind === 'play').map((i) => (i.content as { title: string }).title).sort()).toEqual(hvac.playbooks.map((p) => p.title).sort());
  });

  it('leaves an already tailored runbook alone', async () => {
    await tailorClientRunbook(deps(rewriteAll()), IDS.clientA1);
    const ai = rewriteAll();
    expect((await tailorClientRunbook(deps(ai), IDS.clientA1)).status).toBe('skipped');
    expect(ai.calls.chat).toHaveLength(0);
  });
});

describe('proposeTailoring', () => {
  const parent = { trigger: 'price_change', title: 'Respond to price changes', template: 'Check {{competitor}} on {{service}}.' };
  it('returns a validated proposal and writes nothing', async () => {
    const ai = createFakeAi({ chat: () => JSON.stringify({ items: [{ key: 'play:price_change', title: 'Defend your HVAC price', template: 'Watch {{competitor}} on {{service}} calls.', businessAreaIds: null }] }) });
    const r = await proposeTailoring({ db, ai, packs: hvacPacks }, IDS.clientA1, 'play:price_change', parent);
    expect(r).toEqual({ title: 'Defend your HVAC price', template: 'Watch {{competitor}} on {{service}} calls.', businessAreaIds: null });
    expect(await dbs.owner.select().from(runbook).where(eq(runbook.level, 'client'))).toHaveLength(0);
    expect(await dbs.owner.select().from(runbookItem)).toHaveLength(0);
  });
  it('returns null when the proposal is rejected or the AI fails', async () => {
    const bad = createFakeAi({ chat: () => JSON.stringify({ items: [{ key: 'play:price_change', title: 't', template: 'x {{bogus}}', businessAreaIds: null }] }) });
    expect(await proposeTailoring({ db, ai: bad, packs: hvacPacks }, IDS.clientA1, 'play:price_change', parent)).toBeNull();
    const down = createFakeAi({ chat: () => { throw new Error('down'); } });
    expect(await proposeTailoring({ db, ai: down, packs: hvacPacks }, IDS.clientA1, 'play:price_change', parent)).toBeNull();
  });
  it('proposeTailoring calls runbook_retailor, tailorClientRunbook calls runbook_tailor', async () => {
    const one = createFakeAi({ chat: () => JSON.stringify({ items: [{ key: 'play:price_change', title: 'Defend your HVAC price', template: 'Watch {{competitor}} on {{service}} calls.', businessAreaIds: null }] }) });
    await proposeTailoring({ db, ai: one, packs: hvacPacks }, IDS.clientA1, 'play:price_change', parent);
    expect(one.calls.chat.map((c) => c.task)).toEqual(['runbook_retailor']);
    const whole = rewriteAll();
    await tailorClientRunbook(deps(whole), IDS.clientA1);
    expect(whole.calls.chat.map((c) => c.task)).toEqual(['runbook_tailor']);
  });
});
