import type { Ai, ChatResult } from '@cs/ai';
import { askStarter, changeEvent, client } from '@cs/db';
import { IDS, openTestDbs, pauseAgency, pauseClient, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { GENERIC_STARTERS, generateStarters } from './starters';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());

const NOW = new Date('2026-10-12T12:00:00Z');
const GOOD = ['Did Smith HVAC really cut its tune-up price?', 'Which competitor changed prices this week?', 'How is Smith HVAC advertising right now?', 'What should we do about the new tune-up offer?'];

function fakeAi(text: string | (() => string)) {
  const calls: { task: string; user: string }[] = [];
  const ai = {
    async chat(task: string, input: { messages: { role: string; content: string | null }[] }) {
      calls.push({ task, user: String(input.messages.at(-1)?.content) });
      return { text: typeof text === 'function' ? text() : text, model: 'fake', inputTokens: 0, outputTokens: 0, costUsd: 0, cachedTokens: 0, toolCalls: [], finishReason: 'stop' } satisfies ChatResult;
    },
  } as unknown as Ai;
  return { ai, calls };
}

const addEvent = (summary: string, daysAgo: number, extra: Partial<typeof changeEvent.$inferInsert> = {}) =>
  dbs.owner.insert(changeEvent).values({
    competitorId: IDS.competitorX, changeType: 'price_change', summary, confidence: 0.9,
    occurredAt: new Date(NOW.getTime() - daysAgo * 86_400_000), ...extra,
  });
const rows = () => dbs.owner.select().from(askStarter);

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
  await dbs.owner.update(client).set({ features: ['ask'] }).where(eq(client.id, IDS.clientA1));
});

describe('generateStarters', () => {
  it('writes 4 questions', async () => {
    await addEvent('/pricing: tune-up price changed from $89 to $69', 1);
    const { ai, calls } = fakeAi(JSON.stringify({ questions: GOOD }));
    expect(await generateStarters({ service: dbs.owner, ai }, IDS.clientA1, NOW)).toEqual(GOOD);
    const [r] = await rows();
    expect(r).toMatchObject({ clientId: IDS.clientA1, agencyId: IDS.agencyA, questions: GOOD });
    expect(calls[0]!.task).toBe('ask_starters');
    expect(calls[0]!.user).toContain('tune-up price changed');
    expect(calls[0]!.user).toContain('Smith HVAC');
    expect(GENERIC_STARTERS).toHaveLength(4);
  });

  it('keeps competitor names in event summaries but redacts contact info', async () => {
    await addEvent('Smith HVAC now offers a $69 tune-up; call 512-555-0147 or email owner@smithhvac.example', 1);
    const { ai, calls } = fakeAi(JSON.stringify({ questions: GOOD }));
    await generateStarters({ service: dbs.owner, ai }, IDS.clientA1, NOW);
    const sent = calls[0]!.user;
    expect(sent).toContain('Smith HVAC now offers');
    expect(sent).not.toContain('512-555-0147');
    expect(sent).not.toContain('owner@smithhvac.example');
  });

  it('invalid length → null and row kept', async () => {
    await addEvent('price changed', 1);
    await dbs.owner.insert(askStarter).values({ clientId: IDS.clientA1, agencyId: IDS.agencyA, questions: ['Old question one here?'] });
    const { ai } = fakeAi(JSON.stringify({ questions: [...GOOD.slice(0, 3), 'Too short'] }));
    expect(await generateStarters({ service: dbs.owner, ai }, IDS.clientA1, NOW)).toBeNull();
    expect((await rows()).map((r) => r.questions)).toEqual([['Old question one here?']]);
    const { ai: bad } = fakeAi('not json');
    expect(await generateStarters({ service: dbs.owner, ai: bad }, IDS.clientA1, NOW)).toBeNull();
    expect(await rows()).toHaveLength(1);
  });

  it('no events → null', async () => {
    await addEvent('old news', 20);
    const { ai, calls } = fakeAi(JSON.stringify({ questions: GOOD }));
    expect(await generateStarters({ service: dbs.owner, ai }, IDS.clientA1, NOW)).toBeNull();
    expect(calls).toHaveLength(0);
    expect(await rows()).toHaveLength(0);
  });

  it('inactive or no-ask client skipped', async () => {
    await addEvent('price changed', 1);
    const { ai, calls } = fakeAi(JSON.stringify({ questions: GOOD }));
    await dbs.owner.update(client).set({ features: [] }).where(eq(client.id, IDS.clientA1));
    expect(await generateStarters({ service: dbs.owner, ai }, IDS.clientA1, NOW)).toBeNull();
    await dbs.owner.update(client).set({ features: ['ask'], status: 'prospect' }).where(eq(client.id, IDS.clientA1));
    expect(await generateStarters({ service: dbs.owner, ai }, IDS.clientA1, NOW)).toBeNull();
    expect(calls).toHaveLength(0);
    expect(await rows()).toHaveLength(0);
  });

  it('retracted events excluded', async () => {
    await addEvent('RETRACTED-EVENT-TEXT', 1, { retractedAt: NOW });
    const { ai, calls } = fakeAi(JSON.stringify({ questions: GOOD }));
    expect(await generateStarters({ service: dbs.owner, ai }, IDS.clientA1, NOW)).toBeNull();
    expect(calls).toHaveLength(0);
    await addEvent('visible change', 2);
    await generateStarters({ service: dbs.owner, ai }, IDS.clientA1, NOW);
    expect(calls[0]!.user).toContain('visible change');
    expect(calls[0]!.user).not.toContain('RETRACTED-EVENT-TEXT');
  });
});

describe('generateStarters and billing state (9a)', () => {
  it('makes no model call and writes nothing for a read_only agency, keeping the last row; an agency with no billing row is unaffected', async () => {
    await addEvent('/pricing: tune-up price changed from $89 to $69', 1);
    await pauseAgency(dbs.owner, IDS.agencyA);
    const { ai, calls } = fakeAi(JSON.stringify({ questions: GOOD }));
    expect(await generateStarters({ service: dbs.owner, ai }, IDS.clientA1, NOW)).toBeNull();
    expect(calls).toHaveLength(0);
    expect(await rows()).toEqual([]);
  });
});

describe('generateStarters and a paused client (9b)', () => {
  it('makes no model call and writes nothing for a paused client', async () => {
    await addEvent('/pricing: tune-up price changed from $89 to $69', 1);
    await pauseClient(dbs.owner, IDS.clientA1);
    const { ai, calls } = fakeAi(JSON.stringify({ questions: GOOD }));
    expect(await generateStarters({ service: dbs.owner, ai }, IDS.clientA1, NOW)).toBeNull();
    expect(calls).toHaveLength(0);
    expect(await rows()).toEqual([]);
  });
});
