import { brief, briefItem, client, waitlistEntry } from '@cs/db';
import { IDS } from '@cs/db/test-helpers';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import type { ToolDeps } from '../deps';
import { dbs, resetWorkspace, seedCapture, type SeededCapture } from '../tools/workspace-fixtures';
import { getSampleBrief, sampleEvidenceKey } from './sample';
import { SAMPLE_LINK_TTL_MS, signSampleToken } from './sample-token';

const SECRET = 'sample-test-secret-0123456789abcdef';
const deps = { app: dbs.app, service: dbs.service } as Pick<ToolDeps, 'app' | 'service'>;
const now = new Date();
const exp = now.getTime() + SAMPLE_LINK_TTL_MS;

let entryId: string;
let briefId: string;
let token: string;
let cited: SeededCapture;
let droppedCap: SeededCapture;
let vendor: SeededCapture;

const item = (ord: number, evidenceIds: string[], over: Partial<typeof briefItem.$inferInsert> = {}) => ({
  briefId, agencyId: IDS.agencyA, clientId: IDS.clientA1, ord, competitorId: IDS.competitorX, headline: `Headline ${ord}`, whatChanged: 'w', whyItMatters: 'y',
  recommendedAction: 'r', confidence: 0.9, effort: 'L', impact: 'H', evidenceIds, ...over,
});

beforeEach(async () => {
  await resetWorkspace();
  const [e] = await dbs.service.insert(waitlistEntry).values({
    kind: 'agency', contactName: 'Ada', email: 'ada@a.co', orgName: 'Agency Co', ipHash: 'h', emailConfirmedAt: now,
    sampleRequested: true, sampleStatus: 'sent', sampleBusinessName: 'Smith Dental', sampleClientId: IDS.clientA1, sampleSentAt: now,
  }).returning();
  entryId = e!.id;
  token = signSampleToken(entryId, exp, SECRET);
  const [b] = await dbs.owner.insert(brief).values({
    agencyId: IDS.agencyA, clientId: IDS.clientA1, kind: 'starting_point', status: 'approved', deliveryDate: '2026-10-05', periodStart: now, periodEnd: now, summary: 'Where you stand.',
  }).returning();
  briefId = b!.id;
  cited = await seedCapture();
  droppedCap = await seedCapture();
  vendor = await seedCapture({ kinds: ['vendor_json'], source: 'gbp' });
  await dbs.owner.insert(briefItem).values([
    item(1, [cited.ids.screenshot!, cited.ids.text!, cited.ids.html!, vendor.ids.vendor_json!], { upsellTag: 'seo_audit' }),
    item(2, [droppedCap.ids.screenshot!], { status: 'dropped', headline: 'Dropped one' }),
  ]);
});

describe('getSampleBrief', () => {
  it('null unless the entry is sent', async () => {
    expect(await getSampleBrief(deps, token, SECRET, now)).not.toBeNull();
    for (const status of ['approved', 'failed'] as const) {
      await dbs.service.update(waitlistEntry).set({ sampleStatus: status }).where(eq(waitlistEntry.id, entryId));
      expect(await getSampleBrief(deps, token, SECRET, now)).toBeNull();
    }
    await dbs.service.update(waitlistEntry).set({ sampleStatus: 'sent' }).where(eq(waitlistEntry.id, entryId));
    expect(await getSampleBrief(deps, token, 'other-secret-0123456789abcdef', now)).toBeNull();
    expect(await getSampleBrief(deps, token, SECRET, new Date(exp + 1))).toBeNull();
    expect(await getSampleBrief(deps, signSampleToken('99999999-9999-4999-8999-999999999999', exp, SECRET), SECRET, now)).toBeNull();
    await dbs.service.update(waitlistEntry).set({ sampleClientId: null }).where(eq(waitlistEntry.id, entryId));
    expect(await getSampleBrief(deps, token, SECRET, now)).toBeNull();
  });

  it('returns only active items, no upsell tag', async () => {
    const r = (await getSampleBrief(deps, token, SECRET, now))!;
    expect(r.brief.id).toBe(briefId);
    expect(r.brief.items.map((i) => i.headline)).toEqual(['Headline 1']);
    expect(r.brief.items[0]!.upsellTag).toBeNull();
    const [c] = await dbs.service.select().from(client).where(eq(client.id, IDS.clientA1));
    expect([r.businessName, r.timezone, r.expiresAt]).toEqual([c!.name, c!.timezone, new Date(exp).toISOString()]);
    const refIds = r.refs.map((x) => x.evidenceId).sort();
    expect(refIds).toEqual([cited.ids.screenshot!, cited.ids.text!, cited.ids.html!, vendor.ids.vendor_json!].sort());
    expect(refIds).not.toContain(droppedCap.ids.screenshot);
    const ref = r.refs.find((x) => x.evidenceId === cited.ids.screenshot)!;
    expect(ref.competitorName).toBeTruthy();
    expect(ref.channelLabel).toBe('Website');
    expect(typeof ref.capturedAt).toBe('string');
  });

  it('null for a starting point that is not approved', async () => {
    for (const status of ['ready', 'generating', 'failed']) {
      await dbs.owner.update(brief).set({ status }).where(eq(brief.id, briefId));
      expect(await getSampleBrief(deps, token, SECRET, now)).toBeNull();
    }
    await dbs.owner.update(brief).set({ status: 'sent' }).where(eq(brief.id, briefId));
    expect(await getSampleBrief(deps, token, SECRET, now)).not.toBeNull();
    await dbs.owner.update(brief).set({ kind: 'standard' }).where(eq(brief.id, briefId));
    expect(await getSampleBrief(deps, token, SECRET, now)).toBeNull();
  });
});

describe('sampleEvidenceKey', () => {
  it('evidence not cited → null', async () => {
    expect(await sampleEvidenceKey(dbs.service, token, SECRET, cited.ids.screenshot!, now)).toEqual({ objectKey: cited.objectKeys.screenshot, kind: 'screenshot' });
    expect(await sampleEvidenceKey(dbs.service, token, SECRET, cited.ids.text!, now)).toEqual({ objectKey: cited.objectKeys.text, kind: 'text' });
    expect(await sampleEvidenceKey(dbs.service, token, SECRET, droppedCap.ids.screenshot!, now)).toBeNull(); // cited by a dropped item only
    expect(await sampleEvidenceKey(dbs.service, token, SECRET, droppedCap.ids.text!, now)).toBeNull();
    expect(await sampleEvidenceKey(dbs.service, token, SECRET, 'not-a-uuid', now)).toBeNull();
    expect(await sampleEvidenceKey(dbs.service, `${token}x`, SECRET, cited.ids.screenshot!, now)).toBeNull();
    await dbs.service.update(waitlistEntry).set({ sampleStatus: 'failed' }).where(eq(waitlistEntry.id, entryId));
    expect(await sampleEvidenceKey(dbs.service, token, SECRET, cited.ids.screenshot!, now)).toBeNull();
  });

  it('html/vendor_json → null', async () => {
    expect(await sampleEvidenceKey(dbs.service, token, SECRET, cited.ids.html!, now)).toBeNull();
    expect(await sampleEvidenceKey(dbs.service, token, SECRET, vendor.ids.vendor_json!, now)).toBeNull();
    await dbs.owner.update(brief).set({ status: 'ready' }).where(eq(brief.id, briefId));
    expect(await sampleEvidenceKey(dbs.service, token, SECRET, cited.ids.screenshot!, now)).toBeNull();
  });
});
