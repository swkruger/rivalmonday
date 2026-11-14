import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { openTestDbs, seedTenancy, truncateAll } from '../test/helpers';
import { llmCall, platformSetting } from './index';
import { AI_DECISION_MODE_KEY, createDecisionModeReader, createReevalCallCounter, readAiDecisionMode, writeAiDecisionMode } from './ai-decision-mode';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
});

describe('ai_decision_mode', () => {
  it('missing or invalid row reads as cascade', async () => {
    await dbs.owner.delete(platformSetting).where(eq(platformSetting.key, AI_DECISION_MODE_KEY));
    expect(await readAiDecisionMode(dbs.service)).toEqual({ mode: 'cascade', reevalUntil: null });
    await dbs.owner.insert(platformSetting).values({ key: AI_DECISION_MODE_KEY, value: { mode: 'bogus' }, updatedBy: 't' });
    expect(await readAiDecisionMode(dbs.service)).toEqual({ mode: 'cascade', reevalUntil: null });
  });

  it('writer upserts and round-trips with updated_by', async () => {
    await writeAiDecisionMode(dbs.service, { mode: 'jev_only', reevalUntil: null }, 'u1');
    await writeAiDecisionMode(dbs.service, { mode: 'cascade', reevalUntil: '2026-12-01T00:00:00.000Z' }, 'u2');
    expect(await readAiDecisionMode(dbs.service)).toEqual({ mode: 'cascade', reevalUntil: '2026-12-01T00:00:00.000Z' });
    const rows = await dbs.owner.select().from(platformSetting).where(eq(platformSetting.key, AI_DECISION_MODE_KEY));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.updatedBy).toBe('u2');
  });

  it('accepts offset timestamps', async () => {
    const value = { mode: 'jev_only', reevalUntil: '2026-12-01T00:00:00+00:00' };
    await dbs.owner.insert(platformSetting).values({ key: AI_DECISION_MODE_KEY, value, updatedBy: 't' }).onConflictDoUpdate({ target: platformSetting.key, set: { value } });
    expect(await readAiDecisionMode(dbs.service)).toEqual(value);
  });

  it('counter bump counts local calls inside the cache; refresh resets', async () => {
    let t = 0;
    const c = createReevalCallCounter(dbs.service, { ttlMs: 30_000, now: () => t });
    expect(await c.count()).toBe(0);
    c.bump();
    c.bump();
    expect(await c.count()).toBe(2);
    t += 30_001;
    expect(await c.count()).toBe(0);
  });

  it('reader caches for the ttl and fails to cascade on a DB error', async () => {
    await writeAiDecisionMode(dbs.service, { mode: 'jev_only', reevalUntil: null }, 'u');
    let t = 1_000;
    const read = createDecisionModeReader(dbs.service, { ttlMs: 30_000, now: () => t });
    expect((await read()).mode).toBe('jev_only');
    await writeAiDecisionMode(dbs.service, { mode: 'cascade', reevalUntil: null }, 'u');
    expect((await read()).mode).toBe('jev_only'); // cached
    t += 30_001;
    expect((await read()).mode).toBe('cascade');

    const broken = { select: () => { throw new Error('db down'); } } as unknown as Parameters<typeof createDecisionModeReader>[0];
    expect(await createDecisionModeReader(broken)()).toEqual({ mode: 'cascade', reevalUntil: null });
  });

  it('reeval counter counts only today\'s %:reeval rows', async () => {
    const row = (task: string, createdAt?: Date) => ({ task, provider: 'openrouter', model: 'm', inputTokens: 1, outputTokens: 1, costUsd: 0.001, latencyMs: 1, ok: true, ...(createdAt ? { createdAt } : {}) });
    await dbs.owner.insert(llmCall).values([
      row('llm_decisions:reeval'), row('llm_decisions:reeval'), row('llm_decisions:shadow'), row('image_llm_decisions:reeval'),
      row('llm_decisions:reeval', new Date(Date.now() - 2 * 86_400_000)),
    ]);
    expect(await createReevalCallCounter(dbs.service).count()).toBe(3);
    const broken = { select: () => { throw new Error('db down'); } } as unknown as Parameters<typeof createReevalCallCounter>[0];
    expect(await createReevalCallCounter(broken).count()).toBe(Number.POSITIVE_INFINITY);
  });
});
