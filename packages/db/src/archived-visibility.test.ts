import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { IDS, errorText, openTestDbs, seedTenancy, truncateAll } from '../test/helpers';
import { alert, brief, capture, changeEvent, client, clientCompetitor, evidence, llmCall, recommendation } from './schema';
import { withTenant } from './tenant';

/** 7a2 D16 / migration 0083: app_client_visible() hides an archived client's child rows from every tenant policy. */
const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const admin = { agencyId: IDS.agencyA, clientScope: 'all' as const };

const archive = (at: Date | null) => dbs.service.update(client).set({ archivedAt: at }).where(eq(client.id, IDS.clientA2));

async function seedChildren() {
  const [e] = await dbs.service.insert(changeEvent).values({ competitorId: IDS.competitorY, changeType: 'price_change', summary: 's', confidence: 0.9, occurredAt: new Date() }).returning({ id: changeEvent.id });
  for (const clientId of [IDS.clientA1, IDS.clientA2]) {
    await dbs.service.insert(alert).values({ agencyId: IDS.agencyA, clientId, competitorId: IDS.competitorY, eventId: e!.id, score: 80, status: 'drafting', mode: 'direct' });
    await dbs.service.insert(brief).values({ agencyId: IDS.agencyA, clientId, deliveryDate: '2026-10-05', periodStart: new Date('2026-09-28T00:00:00Z'), periodEnd: new Date('2026-10-04T00:00:00Z'), status: 'ready' });
    await dbs.service.insert(recommendation).values({ agencyId: IDS.agencyA, clientId, title: 'Lower tune-up prices', rationale: 'r', effort: 'L', impact: 'H', owner: 'agency', source: 'brief' });
  }
  // Agency-level (null client) and per-client ledger rows.
  const call = { agencyId: IDS.agencyA, latencyMs: 1, ok: true, task: 't', provider: 'p', model: 'm', inputTokens: 1, outputTokens: 1 };
  await dbs.service.insert(llmCall).values([{ ...call, clientId: null }, { ...call, clientId: IDS.clientA2 }]);
}

const clientIdsOf = (rows: { clientId: string | null }[]) => rows.map((r) => r.clientId).sort();

async function visible() {
  return withTenant(dbs.app, admin, async (tx) => ({
    alerts: clientIdsOf(await tx.select({ clientId: alert.clientId }).from(alert)),
    briefs: clientIdsOf(await tx.select({ clientId: brief.clientId }).from(brief)),
    recommendations: clientIdsOf(await tx.select({ clientId: recommendation.clientId }).from(recommendation)),
    links: clientIdsOf(await tx.select({ clientId: clientCompetitor.clientId }).from(clientCompetitor)),
  }));
}

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
});

describe('archived client visibility (0083)', () => {
  it('an agency admin sees zero alerts, briefs, recommendations and links of an archived client; undo restores them', async () => {
    await seedChildren();
    const both = [IDS.clientA1, IDS.clientA2].sort();
    expect(await visible()).toEqual({ alerts: both, briefs: both, recommendations: both, links: both });
    await archive(new Date());
    expect(await visible()).toEqual({ alerts: [IDS.clientA1], briefs: [IDS.clientA1], recommendations: [IDS.clientA1], links: [IDS.clientA1] });
    await archive(null);
    expect(await visible()).toEqual({ alerts: both, briefs: both, recommendations: both, links: both });
  });

  it('a client-scoped context of the archived client sees nothing either', async () => {
    await seedChildren();
    await archive(new Date());
    const rows = await withTenant(dbs.app, { agencyId: IDS.agencyA, clientScope: [IDS.clientA2] }, (tx) => tx.select({ id: alert.id }).from(alert));
    expect(rows).toEqual([]);
  });

  it('a tenant insert for an archived client is refused by RLS', async () => {
    await archive(new Date());
    const insert = withTenant(dbs.app, admin, (tx) => tx.insert(clientCompetitor).values({ agencyId: IDS.agencyA, clientId: IDS.clientA2, competitorId: IDS.competitorX }));
    expect(await errorText(insert)).toMatch(/row-level security/);
    // The live client is still writable.
    await withTenant(dbs.app, admin, (tx) => tx.insert(clientCompetitor).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, competitorId: IDS.competitorY }));
  });

  it('agency-level rows (null client) are unaffected', async () => {
    await seedChildren();
    await archive(new Date());
    // llm_call admits scope 'all' without app_client_visible (0006: agency-wide cost history), so both rows stay.
    const rows = await withTenant(dbs.app, admin, (tx) => tx.select({ clientId: llmCall.clientId }).from(llmCall));
    expect(rows.map((r) => r.clientId).sort()).toEqual([IDS.clientA2, null]);
    const [all] = await withTenant(dbs.app, admin, (tx) => tx.execute<{ v: boolean | null }>(sql`SELECT app_client_visible(NULL) AS v`));
    expect(all?.v).toBe(true);
    const [scoped] = await withTenant(dbs.app, { agencyId: IDS.agencyA, clientScope: [IDS.clientA1] }, (tx) => tx.execute<{ v: boolean | null }>(sql`SELECT app_client_visible(NULL) AS v`));
    expect(scoped?.v).toBeNull(); // unchanged from 0001: NULL = ANY(...) is NULL (falsy)
  });

  it('evidence of a competitor tracked only by the archived client disappears; shared competitors stay visible', async () => {
    const [cx] = await dbs.service.insert(capture).values({ competitorId: IDS.competitorX, source: 'web', status: 'ok', collectorVersion: 'web/1' }).returning({ id: capture.id });
    const [cy] = await dbs.service.insert(capture).values({ competitorId: IDS.competitorY, source: 'web', status: 'ok', collectorVersion: 'web/1' }).returning({ id: capture.id });
    const ev = (captureId: string, k: string) => ({ captureId, kind: 'text', objectKey: `evidence/${k}.txt`, sha256: k.repeat(64), bytes: 1, contentType: 'text/plain' });
    await dbs.service.insert(evidence).values([ev(cx!.id, 'a'), ev(cy!.id, 'b')]);
    await archive(new Date());
    const rows = await withTenant(dbs.app, admin, (tx) => tx.select({ captureId: evidence.captureId }).from(evidence));
    expect(rows.map((r) => r.captureId)).toEqual([cx!.id]);
    // Agency B still sees X (it tracks X itself).
    const b = await withTenant(dbs.app, { agencyId: IDS.agencyB, clientScope: 'all' }, (tx) => tx.select({ captureId: evidence.captureId }).from(evidence));
    expect(b.map((r) => r.captureId)).toEqual([cx!.id]);
  });

  it('app_client_archived is SECURITY DEFINER, executable by app_user only (not PUBLIC, cs_web or cs_worker)', async () => {
    const [fn] = (await dbs.owner.execute(sql`
      SELECT p.prosecdef AS definer, p.provolatile AS vol, p.proconfig AS cfg,
             has_function_privilege('app_user', p.oid, 'EXECUTE') AS app_user,
             has_function_privilege('cs_web', p.oid, 'EXECUTE') AS cs_web,
             has_function_privilege('cs_worker', p.oid, 'EXECUTE') AS cs_worker
        FROM pg_proc p WHERE p.proname = 'app_client_archived'`)) as unknown as { definer: boolean; vol: string; cfg: string[]; app_user: boolean; cs_web: boolean; cs_worker: boolean }[];
    expect(fn).toEqual({ definer: true, vol: 's', cfg: ['search_path=public, pg_temp'], app_user: true, cs_web: false, cs_worker: false });
  });
});
