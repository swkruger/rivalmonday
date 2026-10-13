import { createAccessContext, hashInput, ToolError } from '@cs/core';
import { auditLog, platformAuditLog } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { recordPlatformAudit, withPlatformAudit } from './audit';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const deps = { service: dbs.service };
const op = createAccessContext({ agencyId: IDS.agencyA, userId: 'op', role: 'agency_admin', clientScope: 'all', features: [] });

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
});

describe('recordPlatformAudit (d8)', () => {
  it('without agencyId writes one platform_audit_log row (same input hash as audit_log) and nothing to audit_log', async () => {
    await recordPlatformAudit(deps, op, { tool: 'platform_overview', input: { range: '12w' }, outcome: 'ok', durationMs: 12, role: 'staff' });
    const rows = await dbs.owner.select().from(platformAuditLog);
    expect(rows).toEqual([expect.objectContaining({ userId: 'op', tool: 'platform_overview', inputHash: hashInput({ range: '12w' }), outcome: 'ok', durationMs: 12 })]);
    expect(await dbs.owner.select().from(auditLog)).toEqual([]);
  });

  it('with agencyId writes into that agency’s audit_log with role platform_<role>', async () => {
    await recordPlatformAudit(deps, op, { tool: 'get_platform_agency', input: { agencyId: IDS.agencyB }, outcome: 'ok', durationMs: 3, agencyId: IDS.agencyB, role: 'owner' });
    expect(await dbs.owner.select().from(auditLog)).toEqual([
      expect.objectContaining({ agencyId: IDS.agencyB, userId: 'op', role: 'platform_owner', tool: 'get_platform_agency', inputHash: hashInput({ agencyId: IDS.agencyB }), outcome: 'ok', channel: 'web', durationMs: 3 }),
    ]);
    expect(await dbs.owner.select().from(platformAuditLog)).toEqual([]);
  });
});

describe('withPlatformAudit', () => {
  it('records ok and returns the result', async () => {
    await expect(withPlatformAudit(deps, op, { tool: 't_ok', input: {}, role: 'viewer' }, async () => 7)).resolves.toBe(7);
    expect(await dbs.owner.select({ outcome: platformAuditLog.outcome }).from(platformAuditLog)).toEqual([{ outcome: 'ok' }]);
  });

  it('records the ToolError code (or internal) and rethrows the original error', async () => {
    const nf = new ToolError('not_found', 'x');
    await expect(withPlatformAudit(deps, op, { tool: 't_nf', input: {}, role: 'viewer' }, async () => { throw nf; })).rejects.toBe(nf);
    await expect(withPlatformAudit(deps, op, { tool: 't_boom', input: {}, role: 'viewer' }, async () => { throw new Error('boom'); })).rejects.toThrow('boom');
    const rows = await dbs.owner.select({ tool: platformAuditLog.tool, outcome: platformAuditLog.outcome }).from(platformAuditLog);
    expect(rows.sort((a, b) => a.tool.localeCompare(b.tool))).toEqual([{ tool: 't_boom', outcome: 'internal' }, { tool: 't_nf', outcome: 'not_found' }]);
  });
});
