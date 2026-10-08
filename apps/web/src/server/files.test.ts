import { createAccessContext } from '@cs/core';
import { brief, capture, evidence, trackedPage, trendReport } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { createMemoryStore, type ObjectStore } from '@cs/storage';
import { createToolRegistry } from '@cs/tools';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveEvidenceDir, serveEvidence, servePdf } from './files';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const registry = createToolRegistry({ app: dbs.app, service: dbs.service }, { audit: { record: async () => {} } });
const owner = createAccessContext({ agencyId: IDS.agencyA, userId: 'o', role: 'client_owner', clientScope: [IDS.clientA1], features: [] });
const otherAgency = createAccessContext({ agencyId: IDS.agencyB, userId: 'b', role: 'agency_admin', clientScope: 'all', features: [] });
const NOW = new Date('2026-10-05T12:00:00Z');
let sentId = '';
let readyId = '';

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
  const base = { agencyId: IDS.agencyA, clientId: IDS.clientA1, periodStart: NOW, periodEnd: NOW };
  const [s] = await dbs.owner.insert(brief).values({ ...base, deliveryDate: '2026-10-05', status: 'sent', sentAt: NOW }).returning();
  const [r] = await dbs.owner.insert(brief).values({ ...base, deliveryDate: '2026-10-12', status: 'ready' }).returning();
  sentId = s!.id;
  readyId = r!.id;
});

function serve(kind: 'brief' | 'report', id: string, ctx = owner, store = createMemoryStore()) {
  const enqueue = vi.fn(async () => {});
  return { res: servePdf({ kind, id, ctx, registry, service: dbs.service, store, enqueue }), enqueue };
}

describe('servePdf', () => {
  it('streams a stored PDF inline', async () => {
    const store = createMemoryStore();
    const key = `briefs/${IDS.agencyA}/${sentId}.pdf`;
    await store.put(key, new Uint8Array([37, 80, 68, 70]), 'application/pdf');
    await dbs.owner.update(brief).set({ pdfKey: key }).where(eq(brief.id, sentId));
    const r = await serve('brief', sentId, owner, store).res;
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toBe('application/pdf');
    expect(r.headers.get('content-disposition')).toBe('inline; filename="brief-2026-10-05.pdf"');
    expect(new Uint8Array(await r.arrayBuffer())).toEqual(new Uint8Array([37, 80, 68, 70]));
  });

  it('enqueues a render and returns a refreshing page when no PDF exists yet', async () => {
    const { res, enqueue } = serve('brief', sentId);
    const r = await res;
    expect(r.status).toBe(202);
    expect(r.headers.get('refresh')).toBe('5');
    expect(await r.text()).toMatch(/preparing/i);
    expect(enqueue).toHaveBeenCalledWith('brief-pdf', { briefId: sentId }, sentId);
  });

  it('re-renders when the key is set but the object is missing', async () => {
    await dbs.owner.update(brief).set({ pdfKey: `briefs/${IDS.agencyA}/${sentId}.pdf` }).where(eq(brief.id, sentId));
    const { res, enqueue } = serve('brief', sentId);
    expect((await res).status).toBe(202);
    expect(enqueue).toHaveBeenCalledOnce();
  });

  it('404s for drafts, other tenants and unknown ids — without enqueueing', async () => {
    const cases: [string, typeof owner][] = [[readyId, owner], [sentId, otherAgency], ['00000000-0000-4000-8000-000000000999', owner], ['nope', owner]];
    for (const [id, ctx] of cases) {
      const { res, enqueue } = serve('brief', id, ctx);
      expect((await res).status).toBe(404);
      expect(enqueue).not.toHaveBeenCalled();
    }
  });

  it('serves reports only once sent', async () => {
    const [rep] = await dbs.owner.insert(trendReport).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, quarter: '2026-Q3', periodStart: NOW, periodEnd: NOW, status: 'ready' }).returning();
    const admin = createAccessContext({ agencyId: IDS.agencyA, userId: 'a', role: 'agency_admin', clientScope: 'all', features: [] });
    expect((await serve('report', rep!.id, admin).res).status).toBe(404);
  });
});

describe('serveEvidence', () => {
  const am = createAccessContext({ agencyId: IDS.agencyA, userId: 'am', role: 'account_manager', clientScope: 'all', features: [] });
  const ownerA2 = createAccessContext({ agencyId: IDS.agencyA, userId: 'o2', role: 'client_owner', clientScope: [IDS.clientA2], features: [] });
  let store: ObjectStore;
  let ids: { screenshot: string; text: string; html: string };
  let missingObjectScreenshotId: string;

  beforeEach(async () => {
    store = createMemoryStore();
    const [page] = await dbs.owner
      .insert(trackedPage)
      .values({ competitorId: IDS.competitorX, url: 'https://smithhvac.example/pricing', pageType: 'pricing', source: 'nav', cadence: 'daily' })
      .returning();
    const [cap] = await dbs.owner
      .insert(capture)
      .values({ competitorId: IDS.competitorX, trackedPageId: page!.id, source: 'web', url: page!.url, status: 'ok', collectorVersion: 't', capturedAt: NOW })
      .returning();
    const kinds: Array<{ kind: 'screenshot' | 'text' | 'html'; contentType: string }> = [
      { kind: 'screenshot', contentType: 'image/webp' },
      { kind: 'text', contentType: 'text/plain' },
      { kind: 'html', contentType: 'text/html' },
    ];
    const seeded: Record<string, string> = {};
    for (const { kind, contentType } of kinds) {
      const objectKey = `evidence/${IDS.competitorX}/${cap!.id}/${kind}`;
      const [row] = await dbs.owner.insert(evidence).values({ captureId: cap!.id, kind, objectKey, sha256: `${kind}-sha`, bytes: 10, contentType }).returning();
      seeded[kind] = row!.id;
      if (kind !== 'html') await store.put(objectKey, new Uint8Array([1, 2, 3]), contentType);
    }
    ids = { screenshot: seeded.screenshot!, text: seeded.text!, html: seeded.html! };

    // A second screenshot evidence row whose object is never put into the store.
    const [cap2] = await dbs.owner
      .insert(capture)
      .values({ competitorId: IDS.competitorX, trackedPageId: page!.id, source: 'web', url: page!.url, status: 'ok', collectorVersion: 't', capturedAt: NOW })
      .returning();
    const missingKey = `evidence/${IDS.competitorX}/${cap2!.id}/screenshot`;
    const [missingRow] = await dbs.owner
      .insert(evidence)
      .values({ captureId: cap2!.id, kind: 'screenshot', objectKey: missingKey, sha256: 'missing-sha', bytes: 10, contentType: 'image/webp' })
      .returning();
    missingObjectScreenshotId = missingRow!.id;
  });

  it('streams a screenshot and a text file with safe headers', async () => {
    const r = await serveEvidence({ clientId: IDS.clientA1, evidenceId: ids.screenshot, ctx: am, registry, service: dbs.service, store });
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toBe('image/webp');
    expect(r.headers.get('x-content-type-options')).toBe('nosniff');
    expect(r.headers.get('cache-control')).toBe('private, no-store');
    const t = await serveEvidence({ clientId: IDS.clientA1, evidenceId: ids.text, ctx: am, registry, service: dbs.service, store });
    expect(t.headers.get('content-type')).toBe('text/plain; charset=utf-8');
  });

  it('never serves html or vendor json, other tenants, bad ids or missing objects (Review Focus 1, 5)', async () => {
    const cases = [
      { clientId: IDS.clientA1, evidenceId: ids.html, ctx: am },
      { clientId: IDS.clientA1, evidenceId: ids.screenshot, ctx: otherAgency },
      { clientId: IDS.clientA2, evidenceId: ids.screenshot, ctx: ownerA2 },
      { clientId: 'nope', evidenceId: ids.screenshot, ctx: am },
      { clientId: IDS.clientA1, evidenceId: missingObjectScreenshotId, ctx: am },
    ];
    for (const c of cases) {
      const r = await serveEvidence({ ...c, registry, service: dbs.service, store });
      expect(r.status).toBe(404);
      expect(await r.text()).toBe('Not found');
    }
  });
});

describe('resolveEvidenceDir', () => {
  it('resolves relative dirs against the worker app and keeps absolute ones', () => {
    expect(resolveEvidenceDir('./.evidence', '/repo/apps/web')).toMatch(/[\\/]repo[\\/]apps[\\/]worker[\\/]\.evidence$/);
    expect(resolveEvidenceDir('/data/evidence', '/repo/apps/web')).toMatch(/[\\/]data[\\/]evidence$/);
    expect(resolveEvidenceDir(undefined, '/repo/apps/web')).toBeUndefined();
  });
});
