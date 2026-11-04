import { alert, brief, briefItem, client, clientCompetitor, competitor } from '@cs/db';
import { IDS } from '@cs/db/test-helpers';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { linkedCompetitors } from '../workspace/evidence-access';
import type { EvidenceRef } from './schemas';
import { ctx, day, dbs, registry, resetWorkspace, seedCapture, seedEvent, seedPage } from './workspace-fixtures';

const am = ctx('account_manager', 'all');
const viewer = ctx('client_viewer', [IDS.clientA1]);
const otherAgency = ctx('agency_admin', 'all', [], IDS.agencyB);

beforeEach(resetWorkspace);

const refs = async (c: typeof am, evidenceIds: string[], clientId: string = IDS.clientA1) =>
  ((await registry.invoke(c, 'get_evidence_refs', { clientId, evidenceIds })) as { items: EvidenceRef[] }).items;

describe('get_evidence_refs', () => {
  it('returns competitor, channel label and capture time for a tracked competitor', async () => {
    const at = new Date(Date.now() - day);
    const a = await seedCapture({ at });
    expect(await refs(viewer, [a.ids.screenshot!])).toEqual([
      { evidenceId: a.ids.screenshot, competitorName: 'Smith HVAC', channelLabel: 'Website', capturedAt: at.toISOString() },
    ]);
  });

  it('keeps input order and collapses duplicates', async () => {
    const a = await seedCapture({ at: new Date(Date.now() - 2 * day) });
    const b = await seedCapture({ at: new Date(Date.now() - day) });
    const items = await refs(am, [b.ids.text!, a.ids.text!, b.ids.text!, a.ids.screenshot!]);
    expect(items.map((i) => i.evidenceId)).toEqual([b.ids.text, a.ids.text, a.ids.screenshot]);
  });

  it('drops ids of an unreachable competitor and keeps the valid one; unknown ids are left out', async () => {
    const ok = await seedCapture({});
    const foreign = await seedCapture({ competitorId: IDS.competitorY });
    const items = await refs(am, [foreign.ids.text!, ok.ids.text!, '00000000-0000-4000-8000-000000000000']);
    expect(items.map((i) => i.evidenceId)).toEqual([ok.ids.text]);
  });

  it('is not found when no id is reachable, for a foreign client or tenant', async () => {
    const foreign = await seedCapture({ competitorId: IDS.competitorY });
    await expect(refs(am, [foreign.ids.text!])).rejects.toMatchObject({ code: 'not_found' });
    const a = await seedCapture({});
    await expect(refs(otherAgency, [a.ids.text!])).rejects.toMatchObject({ code: 'not_found' });
    await expect(refs(am, [a.ids.text!], IDS.clientA2)).rejects.toMatchObject({ code: 'not_found' });
  });

  it('shows an alert-cited, no-longer-tracked competitor to a client role only once the alert is delivered (decision 7)', async () => {
    const { eventId } = await seedEvent({ score: 86, route: 'alert', ageDays: 1 });
    const a = await seedCapture({ at: new Date(Date.now() - day) });
    await dbs.owner.delete(clientCompetitor).where(eq(clientCompetitor.competitorId, IDS.competitorX));
    const [al] = await dbs.owner.insert(alert).values({
      agencyId: IDS.agencyA, clientId: IDS.clientA1, competitorId: IDS.competitorX, eventId, score: 86, status: 'pending_review', mode: 'after_am_check', evidenceIds: [a.ids.screenshot!],
    }).returning();
    await expect(refs(viewer, [a.ids.screenshot!])).rejects.toMatchObject({ code: 'not_found' });
    expect(await refs(am, [a.ids.screenshot!])).toHaveLength(1);
    await dbs.owner.update(alert).set({ status: 'delivered', deliveredAt: new Date() }).where(eq(alert.id, al!.id));
    expect((await refs(viewer, [a.ids.screenshot!])).map((i) => i.evidenceId)).toEqual([a.ids.screenshot]);
  });

  it('rejects more than 60 ids and an empty list as invalid_input', async () => {
    const ids = Array.from({ length: 61 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`);
    await expect(refs(am, ids)).rejects.toMatchObject({ code: 'invalid_input' });
    await expect(refs(am, [])).rejects.toMatchObject({ code: 'invalid_input' });
  });
});

describe('linkedCompetitors (launch-gate final wave: one statement for N competitors)', () => {
  afterEach(() => vi.restoreAllMocks());

  /** Six competitors for client A1: own business, tracked, alert-cited (pending), brief-cited (draft), and two unlinked. */
  async function seedSix() {
    const made = await dbs.owner.insert(competitor).values(['own', 'tracked', 'alerted', 'briefed', 'none1', 'none2']
      .map((n) => ({ name: `C ${n}`, domain: `${n}.lc.example` }))).returning({ id: competitor.id });
    const [own, tracked, alerted, briefed, none1, none2] = made.map((r) => r.id) as [string, string, string, string, string, string];
    await dbs.owner.update(client).set({ selfCompetitorId: own }).where(eq(client.id, IDS.clientA1));
    await dbs.owner.insert(clientCompetitor).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, competitorId: tracked });
    const { eventId } = await seedEvent({ score: 86, route: 'alert', ageDays: 1 });
    await dbs.owner.insert(alert).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, competitorId: alerted, eventId, score: 86, status: 'pending_review', mode: 'after_am_check', evidenceIds: [] });
    const [b] = await dbs.owner.insert(brief).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, deliveryDate: '2026-11-02', periodStart: new Date(Date.now() - 7 * day), periodEnd: new Date(), status: 'ready' }).returning();
    await dbs.owner.insert(briefItem).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, briefId: b!.id, ord: 1, competitorId: briefed, headline: 'h', whatChanged: 'w', whyItMatters: 'y', recommendedAction: 'r', confidence: 0.9, effort: 'L', impact: 'M', status: 'active' });
    // Linked for another client only: must not count for A1.
    await dbs.owner.insert(clientCompetitor).values({ agencyId: IDS.agencyA, clientId: IDS.clientA2, competitorId: none2 });
    return { own, tracked, alerted, briefed, none1, none2, all: [own, tracked, alerted, briefed, none1, none2] };
  }

  /** Counts `withTenant` transactions on the app pool and the statements sent inside them (settings included). */
  function countAppQueries() {
    const original = dbs.app.transaction.bind(dbs.app);
    const counts = { transactions: 0, statements: 0 };
    vi.spyOn(dbs.app, 'transaction').mockImplementation(((fn: (tx: unknown) => Promise<unknown>, cfg?: unknown) => {
      counts.transactions += 1;
      return original((async (tx: { session: { client: { unsafe: (...a: unknown[]) => unknown } } }) => {
        const pg = tx.session.client;
        const unsafe = pg.unsafe.bind(pg);
        pg.unsafe = (...a: unknown[]) => { counts.statements += 1; return unsafe(...a); };
        return fn(tx);
      }) as never, cfg as never);
    }) as never);
    return counts;
  }

  it('answers six competitors with one transaction and one statement after the tenant settings', async () => {
    const s = await seedSix();
    const counts = countAppQueries();
    const linked = await linkedCompetitors({ app: dbs.app, service: dbs.service }, am, IDS.clientA1, s.all);
    expect(counts).toEqual({ transactions: 1, statements: 2 });
    expect([...linked].sort()).toEqual([s.own, s.tracked, s.alerted, s.briefed].sort());
  });

  it('applies the client-role status rules per competitor (pending alert and ready brief do not count)', async () => {
    const s = await seedSix();
    expect([...(await linkedCompetitors({ app: dbs.app, service: dbs.service }, viewer, IDS.clientA1, s.all))].sort()).toEqual([s.own, s.tracked].sort());
    expect(await linkedCompetitors({ app: dbs.app, service: dbs.service }, otherAgency, IDS.clientA1, s.all)).toEqual(new Set());
    expect(await linkedCompetitors({ app: dbs.app, service: dbs.service }, am, IDS.clientA1, [])).toEqual(new Set());
  });

  it('get_evidence_refs over six competitors runs two app transactions (client check + one link check) and keeps the linked items', async () => {
    const s = await seedSix();
    const caps = [];
    for (const id of s.all) {
      const page = await seedPage({ competitorId: id, url: `https://${id}.lc.example/p` });
      caps.push({ id, cap: await seedCapture({ competitorId: id, pageId: page, kinds: ['text'] }) });
    }
    const counts = countAppQueries();
    const items = await refs(am, caps.map((c) => c.cap.ids.text!));
    expect(counts.transactions).toBe(2);
    expect(items.map((i) => i.evidenceId)).toEqual(caps.filter((c) => [s.own, s.tracked, s.alerted, s.briefed].includes(c.id)).map((c) => c.cap.ids.text));
    vi.restoreAllMocks();
    expect((await refs(viewer, caps.map((c) => c.cap.ids.text!))).map((i) => i.evidenceId))
      .toEqual(caps.filter((c) => [s.own, s.tracked].includes(c.id)).map((c) => c.cap.ids.text));
  });
});
