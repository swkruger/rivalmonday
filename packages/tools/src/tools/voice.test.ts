import { type AccessContext, createAccessContext, type VoiceSettings } from '@cs/core';
import { llmCall } from '@cs/db';
import { IDS, openTestDbs, pauseAgency, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { createCatalog } from '@cs/verticals';
import { catalogRows } from '@cs/db';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { seedUser, truncateAuth } from '../../test/fixtures';
import type { ToolDeps } from '../deps';
import { createToolRegistry } from '../registry';
import { VOICE_PREVIEW_LIMIT_COPY } from './voice';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const catalog = createCatalog(() => catalogRows(dbs.service), { ttlMs: 0 });
const preview = vi.fn(async (_v: VoiceSettings, _s: unknown) => 'Example cut its price. Check yours this week.');
const deps = (): ToolDeps => ({ app: dbs.app, service: dbs.service, catalog, platformAdmins: [], enqueue: (async () => {}) as ToolDeps['enqueue'], voicePreview: preview as ToolDeps['voicePreview'] });
const mk = (userId: string, role: 'agency_admin' | 'account_manager' | 'client_owner', agencyId: string = IDS.agencyA) =>
  createAccessContext({ agencyId, userId, role, clientScope: role === 'agency_admin' ? 'all' : [IDS.clientA1], features: [] });
const admin = mk('admin', 'agency_admin');
const am = mk('am', 'account_manager');
const owner = mk('owner', 'client_owner');
const call = (ctx: AccessContext, input: unknown = { voice }, d: ToolDeps = deps()) =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  createToolRegistry(d, { audit: { record: async () => {} } }).invoke(ctx, 'preview_voice', input as Record<string, unknown>) as Promise<any>;
const fails = async (p: Promise<unknown>) => {
  try { await p; } catch (e) { return e as { code?: string; message: string }; }
  throw new Error('expected a failure');
};
const voice: VoiceSettings = { tone: 'direct', preferredTerms: [{ say: 'visit', insteadOf: 'call-out' }], bannedTerms: ['cheap', 'price'] };

const seedCalls = async (n: number, createdAt: Date, agencyId: string = IDS.agencyA, task = 'voice_preview') => {
  await dbs.owner.insert(llmCall).values(Array.from({ length: n }, () => ({
    agencyId, clientId: null, task, provider: 'openrouter', model: 'm', inputTokens: 1, outputTokens: 1, costUsd: 0.001, latencyMs: 1, ok: true, createdAt,
  })));
};

beforeEach(async () => {
  preview.mockClear();
  await truncateAll(dbs.owner);
  await truncateAuth(dbs.owner);
  for (const u of ['admin', 'am', 'owner']) await seedUser(dbs.owner, u, `${u}@example.com`);
  await seedTenancy(dbs.owner);
});

describe('preview_voice', () => {
  it('admin and account manager get the text; bannedTerms reported', async () => {
    for (const ctx of [admin, am]) {
      const r = await call(ctx);
      expect(r).toEqual({ text: 'Example cut its price. Check yours this week.', bannedTerms: ['price'] });
    }
    expect(preview).toHaveBeenCalledWith(voice, { agencyId: IDS.agencyA, clientId: null });
  });

  it('11th preview today refused', async () => {
    await seedCalls(9, new Date());
    expect((await call(admin)).text).toBeTruthy();
    await seedCalls(1, new Date());
    const e = await fails(call(admin));
    expect(e).toMatchObject({ code: 'rate_limited', message: VOICE_PREVIEW_LIMIT_COPY });
    expect(preview).toHaveBeenCalledTimes(1);
  });

  it("yesterday's previews don't count, nor other tasks or agencies", async () => {
    const yesterday = new Date(Date.now() - 36 * 3600_000);
    await seedCalls(10, yesterday);
    await seedCalls(10, new Date(), IDS.agencyA, 'brief_writer');
    await seedCalls(10, new Date(), IDS.agencyB);
    expect((await call(admin)).text).toBeTruthy();
  });

  it('client role → not_found', async () => {
    expect((await fails(call(owner))).code).toBe('not_found');
    expect(preview).not.toHaveBeenCalled();
  });

  it('held agency refused', async () => {
    await pauseAgency(dbs.owner, IDS.agencyA);
    expect((await fails(call(admin))).code).toBe('service_paused');
    expect(preview).not.toHaveBeenCalled();
  });

  it('an invalid voice is refused; an absent voicePreview is a user-facing internal', async () => {
    expect((await fails(call(admin, { voice: { ...voice, tone: 'sassy' } }))).code).toBe('invalid_input');
    const { voicePreview: _omit, ...bare } = deps();
    expect(await fails(call(admin, { voice }, bare as ToolDeps))).toMatchObject({ code: 'internal' });
  });
});
