import { createAccessContext, ToolError } from '@cs/core';
import { hashInput } from '@cs/core/server';
import { auditLog, platformAuditLog } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { recordPlatformAudit, recordSupportAccess, withPlatformAudit } from './audit';

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

  it('writes the support session id the body notes onto the agency audit_log row (8b M4); none by default', async () => {
    const sid = '55555555-5555-4555-8555-555555555555';
    await withPlatformAudit(deps, op, { tool: 't_sid', input: {}, role: 'staff', agencyId: IDS.agencyB }, async (note) => {
      note.supportSessionId = sid;
      return 1;
    });
    await withPlatformAudit(deps, op, { tool: 't_plain', input: {}, role: 'staff', agencyId: IDS.agencyB }, async () => 1);
    const rows = await dbs.owner.select({ tool: auditLog.tool, sid: auditLog.supportSessionId }).from(auditLog);
    expect(rows.sort((a, b) => a.tool.localeCompare(b.tool))).toEqual([{ tool: 't_plain', sid: null }, { tool: 't_sid', sid }]);
  });
});

describe('recordSupportAccess (7a2 Task 7)', () => {
  const sessionId = '00000000-0000-4000-8000-0000000005e5';
  const support = createAccessContext({
    agencyId: IDS.agencyB, userId: 'op', role: 'agency_admin', clientScope: 'all', features: [],
    support: { sessionId, platformUserId: 'op' },
  });

  it('recordSupportAccess no-op outside support', async () => {
    await recordSupportAccess(dbs.service, op, { surface: 'evidence', subjectId: 'e1' });
    expect(await dbs.owner.select().from(auditLog)).toEqual([]);
    expect(await dbs.owner.select().from(platformAuditLog)).toEqual([]);
  });

  it('writes one support_view_<surface> row in the session agency', async () => {
    await recordSupportAccess(dbs.service, support, { surface: 'rank_map', subjectId: IDS.clientB1 });
    expect(await dbs.owner.select().from(auditLog)).toEqual([
      expect.objectContaining({
        agencyId: IDS.agencyB, userId: 'op', role: 'platform_support', tool: 'support_view_rank_map', inputHash: hashInput({ surface: 'rank_map', subjectId: IDS.clientB1 }),
        outcome: 'ok', channel: 'web', tokenId: null, rowCount: null, supportSessionId: sessionId,
      }),
    ]);
  });
});
