import { alert, brief, briefItem, changeEvent, clientCompetitor, detectedChange } from '@cs/db';
import { IDS } from '@cs/db/test-helpers';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { evidenceContentType } from '../workspace/evidence-access';
import { firstVisibleEvent } from '../workspace/scope';
import type { CompareView, EvidenceView } from './schemas';
import { ctx, day, dbs, registry, resetWorkspace, seedCapture, seedEvent } from './workspace-fixtures';

const am = ctx('account_manager', 'all');
const viewerBriefsOnly = ctx('client_viewer', [IDS.clientA1]);
const ownerA1NoDash = ctx('client_owner', [IDS.clientA1]);
const viewerDash = ctx('client_viewer', [IDS.clientA1], ['dashboard']);
const ownerA2 = ctx('client_owner', [IDS.clientA2], ['dashboard']);
const otherAgency = ctx('agency_admin', 'all', [], IDS.agencyB);

beforeEach(resetWorkspace);

const cap = (at: Date, status = 'ok', kinds?: ('html' | 'text' | 'screenshot')[]) => seedCapture({ at, status, kinds });

/** A live (alert-routed, scored for A1) event whose single change runs between the two captures. */
const changeBetween = (before: string, after: string, o: { status?: string; retracted?: boolean } = {}) =>
  seedEvent({ score: 86, route: 'alert', ageDays: 0, captures: { before, after }, changeStatus: o.status, retracted: o.retracted });

const compare = (c: typeof am, changeId: string, clientId: string = IDS.clientA1) =>
  registry.invoke(c, 'compare_snapshots', { clientId, changeId }) as Promise<CompareView>;
const getEvidence = (c: typeof am, evidenceId: string, clientId: string = IDS.clientA1) =>
  registry.invoke(c, 'get_evidence', { clientId, evidenceId }) as Promise<EvidenceView>;

describe('compare_snapshots', () => {
  it('returns both screenshots, the hash and a word diff', async () => {
    const b = await cap(new Date(Date.now() - 2 * day));
    const a = await cap(new Date(Date.now() - day));
    const { changeId } = await changeBetween(b.captureId, a.captureId);
    const v = await compare(am, changeId);
    expect(v.before?.screenshot).toEqual({ evidenceId: b.ids.screenshot, capturedAt: expect.any(String), fallback: false });
    expect(v.after?.hash).toBe(`html-sha-${a.captureId.slice(0, 4)}`);
    expect(v.after?.textEvidenceId).toBe(a.ids.text);
    expect(v.diff).toEqual([{ op: 'equal', text: 'AC tune-up ' }, { op: 'delete', text: '$99' }, { op: 'insert', text: '$79' }]);
    expect(v).toMatchObject({ channel: 'web', channelLabel: 'Website', kind: 'modified', pageUrl: 'https://smithhvac.example/pricing' });
  });

  it('falls back to the newest earlier screenshot of the page for an unchanged capture (Review Focus 5)', async () => {
    await cap(new Date(Date.now() - 6 * day));
    const old = await cap(new Date(Date.now() - 5 * day));
    const unchanged = await cap(new Date(Date.now() - 2 * day), 'unchanged', []);
    const a = await cap(new Date(Date.now() - day));
    const { changeId } = await changeBetween(unchanged.captureId, a.captureId);
    const v = await compare(am, changeId);
    expect(v.before).toMatchObject({ status: 'unchanged', screenshot: { evidenceId: old.ids.screenshot, fallback: true }, hash: null, textEvidenceId: null });
  });

  it('has no screenshot and no earlier fallback for a first capture without one', async () => {
    const b = await cap(new Date(Date.now() - 2 * day), 'ok', ['text']);
    const a = await cap(new Date(Date.now() - day), 'ok', ['text']);
    const { changeId } = await changeBetween(b.captureId, a.captureId);
    const v = await compare(am, changeId);
    expect([v.before?.screenshot, v.after?.screenshot]).toEqual([null, null]);
    expect(v.before?.hash).toBe(`text-sha-${b.captureId.slice(0, 4)}`);
  });

  it('refuses superseded changes, retracted events, other clients and tenants (Review Focus 1, 3)', async () => {
    const b = await cap(new Date(Date.now() - 2 * day));
    const a = await cap(new Date(Date.now() - day));
    const superseded = await changeBetween(b.captureId, a.captureId, { status: 'superseded' });
    const retracted = await changeBetween(b.captureId, a.captureId, { retracted: true });
    const live = await changeBetween(b.captureId, a.captureId);
    for (const changeId of [superseded.changeId, retracted.changeId]) {
      await expect(compare(am, changeId)).rejects.toMatchObject({ code: 'not_found' });
    }
    await expect(compare(ownerA2, live.changeId, IDS.clientA2)).rejects.toMatchObject({ code: 'not_found' });
    await expect(compare(otherAgency, live.changeId)).rejects.toMatchObject({ code: 'not_found' });
    await dbs.owner.delete(clientCompetitor).where(eq(clientCompetitor.competitorId, IDS.competitorX));
    await expect(compare(am, live.changeId)).rejects.toMatchObject({ code: 'not_found' });
  });

  it('needs the dashboard flag for client users (Review Focus 2)', async () => {
    const { changeId } = await seedEvent({ score: 86, route: 'alert', ageDays: 1 });
    await expect(compare(ownerA1NoDash, changeId)).rejects.toMatchObject({ code: 'permission_denied' });
  });

  it('compares through the linked event of the change, and is not found when that event is scored only for another client', async () => {
    const live = await seedEvent({ score: 86, route: 'alert', ageDays: 1 });
    expect(await compare(am, live.changeId)).toMatchObject({ changeId: live.changeId, eventId: live.eventId });
    const foreign = await seedEvent({ score: 86, route: 'alert', ageDays: 1, clientId: IDS.clientA2 });
    await expect(compare(am, foreign.changeId)).rejects.toMatchObject({ code: 'not_found' });
  });

  it('has a null before side and an insert-only diff for an added block (no before capture or text)', async () => {
    const { changeId } = await seedEvent({ score: 86, route: 'alert', ageDays: 1 });
    await dbs.owner.update(detectedChange).set({ kind: 'added', beforeCaptureId: null, beforeText: null }).where(eq(detectedChange.id, changeId));
    const v = await compare(am, changeId);
    expect(v.before).toBeNull();
    expect(v.after?.screenshot).toBeNull();
    expect(v.diff.map((d) => d.op)).toEqual(['insert']);
    expect(v.diff.map((d) => d.text).join('')).toBe('AC tune-up $79');
  });
});

describe('firstVisibleEvent (F8)', () => {
  it('passes when any of several event ids is visible, and returns that one', async () => {
    const deps = { app: dbs.app, service: dbs.service };
    const retracted = await seedEvent({ score: 86, route: 'alert', ageDays: 1, retracted: true });
    const event = { competitorId: IDS.competitorX, changeType: 'price_change', channels: ['web'], services: {}, summary: 's', confidence: 0.9, occurredAt: new Date() };
    const [unscored] = await dbs.owner.insert(changeEvent).values(event).returning();
    const live = await seedEvent({ score: 40, route: 'brief', ageDays: 3 });
    expect(await firstVisibleEvent(deps, am, IDS.clientA1, [retracted.eventId, unscored!.id])).toBeNull();
    expect(await firstVisibleEvent(deps, am, IDS.clientA1, [retracted.eventId, unscored!.id, live.eventId])).toBe(live.eventId);
    expect(await firstVisibleEvent(deps, am, IDS.clientA1, [])).toBeNull();
  });
});

describe('get_evidence', () => {
  it('opens evidence for any client role (no dashboard flag); only dashboard users get the live changes that cite it (decision 7)', async () => {
    const b = await cap(new Date(Date.now() - 2 * day));
    const a = await cap(new Date(Date.now() - day));
    const { eventId } = await changeBetween(b.captureId, a.captureId);
    await changeBetween(b.captureId, a.captureId, { retracted: true });
    await changeBetween(b.captureId, a.captureId, { status: 'superseded' });
    const v = await getEvidence(viewerBriefsOnly, a.ids.screenshot!);
    expect(v).toMatchObject({ kind: 'screenshot', servable: true, competitorName: 'Smith HVAC', channelLabel: 'Website', captureStatus: 'ok', contentType: 'image/webp', legalHold: false });
    expect(v.citedBy).toEqual([]);
    const withDash = await getEvidence(viewerDash, a.ids.screenshot!);
    expect(withDash.citedBy.map((c) => c.eventId)).toEqual([eventId]);
    expect(withDash.citedBy[0]).toMatchObject({ typeLabel: 'Price change', summary: 'Smith HVAC cut its AC tune-up to $79' });
    expect((await getEvidence(am, a.ids.screenshot!)).citedBy.map((c) => c.eventId)).toEqual([eventId]);
    expect((await getEvidence(am, a.ids.html!)).servable).toBe(false);
    expect((await getEvidence(am, a.ids.text!)).servable).toBe(true);
    expect(['screenshot', 'text', 'html', 'vendor_json', 'toString'].map(evidenceContentType)).toEqual(['image/webp', 'text/plain; charset=utf-8', undefined, undefined, undefined]);
  });

  it('keeps evidence open after the competitor is removed only while a visible brief item cites that competitor (decision 7)', async () => {
    const a = await cap(new Date(Date.now() - day));
    await dbs.owner.delete(clientCompetitor).where(eq(clientCompetitor.competitorId, IDS.competitorX));
    await expect(getEvidence(viewerBriefsOnly, a.ids.screenshot!)).rejects.toMatchObject({ code: 'not_found' });
    const [br] = await dbs.owner.insert(brief).values({
      agencyId: IDS.agencyA, clientId: IDS.clientA1, deliveryDate: '2026-10-12', periodStart: new Date(), periodEnd: new Date(), status: 'ready', summary: 's',
    }).returning();
    const [item] = await dbs.owner.insert(briefItem).values({
      agencyId: IDS.agencyA, clientId: IDS.clientA1, briefId: br!.id, ord: 0, competitorId: IDS.competitorX, headline: 'h', whatChanged: 'w', whyItMatters: 'y',
      recommendedAction: 'r', confidence: 0.9, effort: 'L', impact: 'H', evidenceIds: [a.ids.screenshot!],
    }).returning();
    // A draft (ready) brief does not count for a client role, but does for the agency …
    await expect(getEvidence(viewerBriefsOnly, a.ids.screenshot!)).rejects.toMatchObject({ code: 'not_found' });
    expect((await getEvidence(am, a.ids.screenshot!)).evidenceId).toBe(a.ids.screenshot);
    // … an approved one does.
    await dbs.owner.update(brief).set({ status: 'approved' }).where(eq(brief.id, br!.id));
    expect((await getEvidence(viewerBriefsOnly, a.ids.screenshot!)).citedBy).toEqual([]);
    // A dropped item no longer counts (F14).
    await dbs.owner.update(briefItem).set({ status: 'dropped' }).where(eq(briefItem.id, item!.id));
    await expect(getEvidence(viewerBriefsOnly, a.ids.screenshot!)).rejects.toMatchObject({ code: 'not_found' });
    await expect(getEvidence(am, a.ids.screenshot!)).rejects.toMatchObject({ code: 'not_found' });
  });

  it('keeps evidence open after removal while a delivered alert cites that competitor; a pending one only for the agency (decision 7)', async () => {
    const { eventId } = await seedEvent({ score: 86, route: 'alert', ageDays: 1 });
    const a = await seedCapture({ at: new Date(Date.now() - day) });
    await dbs.owner.delete(clientCompetitor).where(eq(clientCompetitor.competitorId, IDS.competitorX));
    const [al] = await dbs.owner.insert(alert).values({
      agencyId: IDS.agencyA, clientId: IDS.clientA1, competitorId: IDS.competitorX, eventId, score: 86, status: 'pending_review', mode: 'after_am_check', evidenceIds: [a.ids.screenshot!],
    }).returning();
    await expect(getEvidence(viewerBriefsOnly, a.ids.screenshot!)).rejects.toMatchObject({ code: 'not_found' });
    expect((await getEvidence(am, a.ids.screenshot!)).evidenceId).toBe(a.ids.screenshot);
    await dbs.owner.update(alert).set({ status: 'delivered', deliveredAt: new Date() }).where(eq(alert.id, al!.id));
    const v = await getEvidence(viewerBriefsOnly, a.ids.screenshot!);
    // The citing event's competitor is no longer tracked, so no "part of these changes" links (decision 3).
    expect(v.citedBy).toEqual([]);
  });

  it('is not found for another client, another tenant or an unknown id', async () => {
    const a = await cap(new Date(Date.now() - day));
    await expect(getEvidence(ownerA2, a.ids.screenshot!, IDS.clientA2)).rejects.toMatchObject({ code: 'not_found' });
    await expect(getEvidence(otherAgency, a.ids.screenshot!)).rejects.toMatchObject({ code: 'not_found' });
    await expect(getEvidence(am, '00000000-0000-4000-8000-000000000000')).rejects.toMatchObject({ code: 'not_found' });
  });
});
