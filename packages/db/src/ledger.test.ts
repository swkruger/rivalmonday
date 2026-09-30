import { createAccessContext, ToolRegistry, toolkit } from '@cs/core';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { errorText, IDS, openTestDbs, seedTenancy, truncateAll } from '../test/helpers';
import { createAuditSink } from './audit';
import { createLedgerSink } from './ledger';
import { auditLog, llmCall, vendorCall } from './schema';
import { withTenant } from './tenant';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
});

const base = { task: 'brief_writer', provider: 'openrouter', model: 'm', inputTokens: 10, outputTokens: 5, costUsd: 0.001, latencyMs: 20, ok: true };

describe('ledger sink', () => {
  it('records llm calls and scopes reads by agency', async () => {
    const sink = createLedgerSink(dbs.service);
    await sink.recordLlmCall({ ...base, agencyId: IDS.agencyA, clientId: IDS.clientA1 });
    await sink.recordLlmCall({ ...base, agencyId: IDS.agencyB, clientId: IDS.clientB1 });
    await sink.recordLlmCall({ ...base, agencyId: null, clientId: null });

    expect(await dbs.service.select().from(llmCall)).toHaveLength(3);
    const seenByA = await withTenant(dbs.app, { agencyId: IDS.agencyA, clientScope: 'all' }, (tx) => tx.select().from(llmCall));
    expect(seenByA).toHaveLength(1);
    expect(seenByA[0]).toMatchObject({ agencyId: IDS.agencyA, costUsd: 0.001, ok: true });
  });

  it('records vendor calls', async () => {
    const sink = createLedgerSink(dbs.service);
    await expect(
      sink.recordVendorCall({ agencyId: null, clientId: null, vendor: 'dataforseo', operation: 'reviews', units: 10, costUsd: null, latencyMs: 5, ok: true }),
    ).resolves.toBeUndefined();
  });
});

describe('audit sink', () => {
  it('persists registry audit events', async () => {
    const { defineTool } = toolkit<null>();
    const registry = new ToolRegistry(null, createAuditSink(dbs.service)).register(
      defineTool({
        name: 'ping',
        description: 'ping',
        input: z.object({}),
        output: z.object({ items: z.array(z.string()) }),
        permission: 'read',
        handler: async () => ({ items: ['pong'] }),
      }),
    );
    const ctx = createAccessContext({ agencyId: IDS.agencyA, userId: 'u1', role: 'agency_admin', clientScope: 'all', features: [] });
    await registry.invoke(ctx, 'ping', {});

    const rows = await withTenant(dbs.app, { agencyId: IDS.agencyA, clientScope: 'all' }, (tx) => tx.select().from(auditLog));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ tool: 'ping', outcome: 'ok', rowCount: 1, userId: 'u1', role: 'agency_admin' });
  });
});

describe('ledger and audit tables are read-only for app_user', () => {
  // Each statement runs in its own withTenant transaction: a permission-denied error aborts the
  // Postgres transaction, so any further statement inside that same transaction would only report
  // "current transaction is aborted" rather than the real cause.
  it('app_user cannot INSERT into audit_log, llm_call, or vendor_call', async () => {
    const auditInsert = await errorText(
      withTenant(dbs.app, { agencyId: IDS.agencyA, clientScope: 'all' }, (tx) =>
        tx.insert(auditLog).values({
          agencyId: IDS.agencyA,
          userId: 'u1',
          role: 'agency_admin',
          tool: 'ping',
          inputHash: 'h',
          outcome: 'ok',
          rowCount: null,
          durationMs: 1,
        }),
      ),
    );
    expect(auditInsert).toMatch(/permission denied/i);

    const llmInsert = await errorText(
      withTenant(dbs.app, { agencyId: IDS.agencyA, clientScope: 'all' }, (tx) =>
        tx.insert(llmCall).values({ ...base, agencyId: IDS.agencyA, clientId: IDS.clientA1 }),
      ),
    );
    expect(llmInsert).toMatch(/permission denied/i);

    const vendorInsert = await errorText(
      withTenant(dbs.app, { agencyId: IDS.agencyA, clientScope: 'all' }, (tx) =>
        tx.insert(vendorCall).values({
          agencyId: IDS.agencyA,
          clientId: IDS.clientA1,
          vendor: 'dataforseo',
          operation: 'reviews',
          units: 1,
          costUsd: null,
          latencyMs: 1,
          ok: true,
        }),
      ),
    );
    expect(vendorInsert).toMatch(/permission denied/i);
  });

  it('app_user cannot UPDATE or DELETE audit_log, llm_call, or vendor_call', async () => {
    const auditSink = createAuditSink(dbs.service);
    const ledgerSink = createLedgerSink(dbs.service);
    await auditSink.record({
      agencyId: IDS.agencyA,
      userId: 'u1',
      role: 'agency_admin',
      tool: 'ping',
      inputHash: 'h',
      outcome: 'ok',
      rowCount: null,
      durationMs: 1,
    });
    await ledgerSink.recordLlmCall({ ...base, agencyId: IDS.agencyA, clientId: IDS.clientA1 });
    await ledgerSink.recordVendorCall({
      agencyId: IDS.agencyA,
      clientId: IDS.clientA1,
      vendor: 'dataforseo',
      operation: 'reviews',
      units: 1,
      costUsd: null,
      latencyMs: 1,
      ok: true,
    });

    const withA = (fn: (tx: Parameters<Parameters<typeof withTenant>[2]>[0]) => Promise<unknown>) =>
      withTenant(dbs.app, { agencyId: IDS.agencyA, clientScope: 'all' }, fn);

    expect(await errorText(withA((tx) => tx.update(auditLog).set({ outcome: 'internal' })))).toMatch(/permission denied/i);
    expect(await errorText(withA((tx) => tx.delete(auditLog)))).toMatch(/permission denied/i);
    expect(await errorText(withA((tx) => tx.update(llmCall).set({ ok: false })))).toMatch(/permission denied/i);
    expect(await errorText(withA((tx) => tx.delete(llmCall)))).toMatch(/permission denied/i);
    expect(await errorText(withA((tx) => tx.update(vendorCall).set({ ok: false })))).toMatch(/permission denied/i);
    expect(await errorText(withA((tx) => tx.delete(vendorCall)))).toMatch(/permission denied/i);
  });

  it('client-scoped context sees only its own llm_call rows (not other clients or agency-level rows) and no audit_log rows', async () => {
    const ledgerSink = createLedgerSink(dbs.service);
    const auditSink = createAuditSink(dbs.service);
    await ledgerSink.recordLlmCall({ ...base, agencyId: IDS.agencyA, clientId: IDS.clientA1 });
    await ledgerSink.recordLlmCall({ ...base, agencyId: IDS.agencyA, clientId: IDS.clientA2 });
    await ledgerSink.recordLlmCall({ ...base, agencyId: IDS.agencyA, clientId: null });
    await auditSink.record({
      agencyId: IDS.agencyA,
      userId: 'u1',
      role: 'agency_admin',
      tool: 'ping',
      inputHash: 'h',
      outcome: 'ok',
      rowCount: null,
      durationMs: 1,
    });

    const seenByA1 = await withTenant(dbs.app, { agencyId: IDS.agencyA, clientScope: [IDS.clientA1] }, (tx) => tx.select().from(llmCall));
    expect(seenByA1).toHaveLength(1);
    expect(seenByA1[0]).toMatchObject({ clientId: IDS.clientA1 });

    const auditByA1 = await withTenant(dbs.app, { agencyId: IDS.agencyA, clientScope: [IDS.clientA1] }, (tx) => tx.select().from(auditLog));
    expect(auditByA1).toEqual([]);

    const seenByAll = await withTenant(dbs.app, { agencyId: IDS.agencyA, clientScope: 'all' }, (tx) => tx.select().from(llmCall));
    expect(seenByAll).toHaveLength(3);

    const auditByAll = await withTenant(dbs.app, { agencyId: IDS.agencyA, clientScope: 'all' }, (tx) => tx.select().from(auditLog));
    expect(auditByAll).toHaveLength(1);
  });
});
