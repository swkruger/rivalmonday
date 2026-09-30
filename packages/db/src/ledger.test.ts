import { createAccessContext, ToolRegistry, toolkit } from '@cs/core';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '../test/helpers';
import { createAuditSink } from './audit';
import { createLedgerSink } from './ledger';
import { auditLog, llmCall } from './schema';
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
