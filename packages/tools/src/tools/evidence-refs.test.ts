import { alert, clientCompetitor } from '@cs/db';
import { IDS } from '@cs/db/test-helpers';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import type { EvidenceRef } from './schemas';
import { ctx, day, dbs, registry, resetWorkspace, seedCapture, seedEvent } from './workspace-fixtures';

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
