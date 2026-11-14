import { type AccessContext, createAccessContext } from '@cs/core';
import { decisionSample, llmCall, platformAdmin, platformAuditLog, readAiDecisionMode, readAiDecisionState, writeAiDecisionMode } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { seedUser, truncateAuth } from '../../test/fixtures';
import { createToolRegistry } from '../registry';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const registry = createToolRegistry({ app: dbs.app, service: dbs.service, platformAdmins: [] }, { audit: { record: async () => {} } });
const base = createAccessContext({ agencyId: IDS.agencyA, userId: 'x', role: 'agency_admin', clientScope: 'all', features: [] });
const as = (userId: string) => ({ ...base, userId }) as AccessContext;
const staff = as('staff');
const viewer = as('pviewer');
const tenant = as('tenant-admin');
const call = (c: AccessContext, tool: string, input: unknown = {}) => registry.invoke(c, tool, input) as Promise<any>;
const DAY = 86_400_000;

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await truncateAuth(dbs.owner);
  await seedTenancy(dbs.owner);
  for (const u of ['staff', 'pviewer', 'tenant-admin']) await seedUser(dbs.owner, u, `${u}@example.com`);
  await dbs.owner.insert(platformAdmin).values([
    { userId: 'staff', role: 'staff', createdBy: 'test' },
    { userId: 'pviewer', role: 'viewer', createdBy: 'test' },
  ]);
});

type SA = import('@cs/db').SampleAnswers;
const answers = (provider: string, entries: Record<string, { value: unknown; confidence: number }>): SA => ({
  provider,
  answers: Object.fromEntries(Object.entries(entries).map(([k, v]) => [k, { type: 'noul', probability: 0.5, ...v }])),
});

describe('ai decision mode tools', () => {
  it('start sets +7 d, keeps the mode; stop clears reevalUntil; mode change is independent', async () => {
    await writeAiDecisionMode(dbs.owner, { mode: 'jev_only', reevalUntil: null }, 'seed');
    const before = Date.now();
    const s = await call(staff, 'set_ai_decision_mode', { reeval: 'start' });
    expect(s.mode).toBe('jev_only');
    const until = new Date(s.reevalUntil).getTime();
    expect(until).toBeGreaterThanOrEqual(before + 7 * DAY);
    expect(until).toBeLessThanOrEqual(Date.now() + 7 * DAY);
    expect(await readAiDecisionMode(dbs.service)).toEqual(s);
    const c = await call(staff, 'set_ai_decision_mode', { mode: 'cascade' });
    expect(c).toEqual({ mode: 'cascade', reevalUntil: s.reevalUntil });
    const stopped = await call(staff, 'set_ai_decision_mode', { reeval: 'stop' });
    expect(stopped).toEqual({ mode: 'cascade', reevalUntil: null });
    expect(await readAiDecisionMode(dbs.service)).toEqual(stopped);
    await expect(call(staff, 'set_ai_decision_mode', {})).rejects.toMatchObject({ code: 'invalid_input' });
    const audit = await dbs.owner.select().from(platformAuditLog).where(eq(platformAuditLog.tool, 'set_ai_decision_mode'));
    expect(audit.filter((a) => a.outcome === 'ok')).toHaveLength(3);
  });

  it('non-staff gets not_found (viewer cannot set, tenant admin cannot read)', async () => {
    await expect(call(viewer, 'set_ai_decision_mode', { mode: 'cascade' })).rejects.toMatchObject({ code: 'not_found' });
    await expect(call(tenant, 'get_ai_decision_mode')).rejects.toMatchObject({ code: 'not_found' });
    await expect(call(tenant, 'set_ai_decision_mode', { reeval: 'stop' })).rejects.toMatchObject({ code: 'not_found' });
    expect(await call(viewer, 'get_ai_decision_mode')).toMatchObject({ mode: 'cascade', reevalUntil: null, window: null });
  });

  it('computes agreement, Jev-below-tau and allocated LLM spend from the window samples', async () => {
    const until = new Date(Date.now() + 3 * DAY);
    await writeAiDecisionMode(dbs.owner, { mode: 'jev_only', reevalUntil: until.toISOString() }, 'seed');
    const row = (task: string, primary: SA, fallback: SA | null, at = new Date()) => ({
      task, reason: 'reeval' as const, state: {}, questions: {}, primary, fallback, final: {}, createdAt: at,
    });
    await dbs.owner.insert(decisionSample).values([
      // tag_decisions tau 0.85: a agrees, b disagrees (b below tau), c has no fallback answer
      row('tag_decisions', answers('jev', { a: { value: true, confidence: 0.95 }, b: { value: true, confidence: 0.6 }, c: { value: false, confidence: 0.9 } }),
        answers('llm', { a: { value: true, confidence: 0.9 }, b: { value: false, confidence: 0.9 } })),
      row('price_decisions', answers('jev', { a: { value: true, confidence: 0.99 } }), answers('llm', { a: { value: true, confidence: 0.9 } })),
      // outside the window and another reason: ignored
      row('tag_decisions', answers('jev', { a: { value: true, confidence: 0.1 } }), answers('llm', { a: { value: false, confidence: 0.9 } }), new Date(Date.now() - 20 * DAY)),
      { ...row('tag_decisions', answers('jev', { a: { value: true, confidence: 0.1 } }), null), reason: 'shadow' as const },
    ]);
    const led = (task: string, costUsd: number, createdAt = new Date()) => ({ task, provider: 'openrouter', model: 'm', inputTokens: 1, outputTokens: 1, costUsd, latencyMs: 1, ok: true, createdAt });
    await dbs.owner.insert(llmCall).values([led('tag_decisions:reeval', 0.5), led('tag_decisions:reeval', 0.25), led('price_decisions:reeval', 0.1), led('tag_decisions', 9), led('tag_decisions:reeval', 7, new Date(Date.now() - 20 * DAY))]);

    const r = await call(staff, 'get_ai_decision_mode');
    expect(r.mode).toBe('jev_only');
    expect(r.reevalUntil).toBe(until.toISOString());
    expect(new Date(r.window.from).getTime()).toBe(until.getTime() - 7 * DAY);
    expect(r.window.tasks).toEqual([
      { task: 'price_decisions', samples: 1, agreement: 1, jevBelowTau: 0, llmUsd: expect.closeTo(0.1, 6) },
      { task: 'tag_decisions', samples: 1, agreement: 0.5, jevBelowTau: expect.closeTo(1 / 3, 6), llmUsd: expect.closeTo(0.75, 6) },
    ]);
  });

  it('window bounds are stored: a second start keeps reevalFrom, stop records lastWindow and clears the window', async () => {
    const s1 = await call(staff, 'set_ai_decision_mode', { reeval: 'start' });
    const st1 = await readAiDecisionState(dbs.service);
    expect(st1.reevalFrom).not.toBeNull();
    await new Promise((r) => setTimeout(r, 15));
    const s2 = await call(staff, 'set_ai_decision_mode', { reeval: 'start', mode: 'cascade' });
    expect(new Date(s2.reevalUntil).getTime()).toBeGreaterThan(new Date(s1.reevalUntil).getTime());
    expect((await readAiDecisionState(dbs.service)).reevalFrom).toBe(st1.reevalFrom);
    await call(staff, 'set_ai_decision_mode', { reeval: 'stop' });
    const st = await readAiDecisionState(dbs.service);
    expect(st).toMatchObject({ reevalFrom: null, reevalUntil: null, lastWindow: { from: st1.reevalFrom } });
    const r = await call(staff, 'get_ai_decision_mode');
    expect(r.window).toMatchObject({ from: st1.reevalFrom, tasks: [] });
  });

  it('an expired window never stopped reads from reevalFrom to reevalUntil; none ever run is null', async () => {
    expect((await call(staff, 'get_ai_decision_mode')).window).toBeNull();
    const from = new Date(Date.now() - 9 * DAY).toISOString();
    const to = new Date(Date.now() - 2 * DAY).toISOString();
    await writeAiDecisionMode(dbs.owner, { mode: 'jev_only', reevalUntil: to, reevalFrom: from }, 'seed');
    expect((await call(staff, 'get_ai_decision_mode')).window).toMatchObject({ from, to });
  });
});
