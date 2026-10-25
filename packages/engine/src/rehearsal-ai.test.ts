import { type AiConfig, DEFAULT_AI_CONFIG_PATH, type DecisionQuestion, loadAiConfigFile } from '@cs/ai';
import type { AiGuard, CallScope, LedgerSink, LlmCallRecord } from '@cs/core';
import { brief, briefItem } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { loadVerticalPack } from '@cs/verticals';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createFakeAi } from '../test/fake-ai';
import { day, seedScoredEvent } from '../test/seed';
import { generateBrief } from './briefs/generate';
import { buildWriterPrompt } from './briefs/writer';
import { createRehearsalAi, DEFAULT_REHEARSAL_LATENCY, loadRehearsalLatency, sampleLatency } from './rehearsal-ai';
import { createPackLoader } from './tag/tag-stage';

let config: AiConfig;
beforeAll(async () => {
  config = await loadAiConfigFile(DEFAULT_AI_CONFIG_PATH);
});

function memoryLedger(): LedgerSink & { rows: LlmCallRecord[] } {
  const rows: LlmCallRecord[] = [];
  return { rows, recordLlmCall: async (r) => void rows.push(r), recordVendorCall: async () => undefined };
}

const LIVE = 'live-client';
const scope = (clientId: string | null): CallScope => ({ agencyId: 'a', clientId });
const noSleep = async () => undefined;

function build(o: { guard?: AiGuard; sleeps?: number[]; random?: () => number; live?: ReturnType<typeof createFakeAi> } = {}) {
  const ledger = memoryLedger();
  const live = o.live ?? createFakeAi({ chat: () => 'live answer' });
  const ai = createRehearsalAi({
    live, liveClientIds: new Set([LIVE]), latency: {}, config, ledger, random: o.random, guard: o.guard,
    sleep: o.sleeps ? async (ms) => void o.sleeps!.push(ms) : noSleep,
  });
  return { ai, ledger, live };
}

/** A schema exercising every JSON-schema shape our writers use. */
const SAMPLE_SCHEMA: Record<string, unknown> = {
  type: 'object', additionalProperties: false, required: ['title', 'level', 'count', 'share', 'ok', 'items', 'nested'],
  properties: {
    title: { type: 'string', minLength: 3, maxLength: 80 },
    level: { type: 'string', enum: ['L', 'M', 'H'] },
    count: { type: 'integer', minimum: 1, maximum: 5 },
    share: { type: 'number', minimum: 0, maximum: 1 },
    ok: { type: 'boolean' },
    optional: { type: 'string' },
    items: { type: 'array', minItems: 1, items: { type: 'object', additionalProperties: false, required: ['ref'], properties: { ref: { type: 'string' } } } },
    nested: { type: 'object', additionalProperties: false, required: ['note'], properties: { note: { type: ['string', 'null'] } } },
  },
};

describe('createRehearsalAi', () => {
  it('non-live client calls are ledgered at $0 with provider rehearsal', async () => {
    const { ai, ledger, live } = build();
    await ai.chat('playbook_writer', { messages: [{ role: 'user', content: 'hi' }] }, scope('other'));
    await ai.decide('verifier_decisions', { evidence: 'x' }, { s0: { type: 'noul', instructions: 'true?' } }, scope(null));
    await ai.embed('embeddings', ['a b c'], scope('other'));
    expect(live.calls.chat).toHaveLength(0);
    expect(ledger.rows.map((r) => r.task)).toEqual(['playbook_writer', 'verifier_decisions', 'embeddings']);
    for (const r of ledger.rows) expect(r).toMatchObject({ provider: 'rehearsal', costUsd: 0, ok: true });
  });

  it('non-live calls pass the spend guard first', async () => {
    const seen: CallScope[] = [];
    const { ai } = build({ guard: { assertAllowed: async (s) => void seen.push(s) } });
    await ai.chat('playbook_writer', { messages: [{ role: 'user', content: 'hi' }] }, scope('other'));
    expect(seen).toEqual([scope('other')]);
  });

  it('live client calls go to the live Ai', async () => {
    const { ai, ledger, live } = build();
    const r = await ai.chat('playbook_writer', { messages: [{ role: 'user', content: 'hi' }] }, scope(LIVE));
    expect(r.text).toBe('live answer');
    await ai.embed('embeddings', ['x'], scope(LIVE));
    expect(live.calls.chat).toHaveLength(1);
    expect(live.calls.embed).toEqual([['x']]);
    expect(ledger.rows).toHaveLength(0);
  });

  it('every ai.yaml chat task returns a schema-valid answer', async () => {
    const { ai } = build();
    const tasks = Object.entries(config.tasks);
    expect(tasks.length).toBeGreaterThan(10);
    const questions: Record<string, DecisionQuestion> = {
      supported: { type: 'noul', instructions: 'Is it supported?' },
      pick: { type: 'choice', instructions: 'Which?', options: { no: 'No', yes: 'Yes' } },
      grade: { type: 'score', instructions: 'How much?', levels: ['low', 'mid', 'high'] },
    };
    for (const [name, t] of tasks) {
      if (t.provider === 'anthropic') {
        expect(ai.batchAvailable(name), name).toBe(false);
      } else if (t.provider === 'jev' || t.mode === 'decisions') {
        const r = await ai.decide(name, { evidence: 'e' }, questions, scope(null));
        expect(r.needsReview, name).toEqual([]);
        expect(r.answers.supported, name).toMatchObject({ type: 'noul', value: true, confidence: 0.95 });
        expect(r.answers.pick, name).toMatchObject({ type: 'choice', value: 'yes', confidence: 0.95 });
        expect(r.answers.grade, name).toMatchObject({ type: 'score', confidence: 0.95 });
      } else if (t.mode === 'embeddings') {
        const r = await ai.embed(name, ['one two', 'three'], scope(null));
        expect(r.vectors.map((v) => v.length), name).toEqual([512, 512]);
      } else {
        const res = await ai.chat(name, { messages: [{ role: 'user', content: 'Write it.' }], jsonSchema: { name: 'sample', schema: SAMPLE_SCHEMA } }, scope(null));
        const parsed = z.fromJSONSchema(SAMPLE_SCHEMA).safeParse(JSON.parse(res.text));
        expect(parsed.success, `${name}: ${res.text}`).toBe(true);
        const plain = await ai.chat(name, { messages: [{ role: 'user', content: 'Say hi.' }] }, scope(null));
        expect(plain.text, name).toMatch(/^[A-Z].+\.$/);
        const tools = await ai.chatWithTools(name, { messages: [{ role: 'user', content: 'Hi' }], tools: [{ name: 't', description: 'd', parameters: {} }] }, scope(null));
        expect(tools.toolCalls, name).toEqual([]);
      }
    }
  });

  it('the brief writer answers one item per candidate, quoting only that candidate\'s evidence', async () => {
    const { ai } = build();
    const cand = (id: string, name: string, summary: string) => ({
      kind: 'event' as const, eventId: id, competitorId: id, competitorName: name, changeType: 'price_change', score: 60, route: 'brief' as const,
      occurredAt: new Date('2026-09-30T06:00:00Z'), confidence: 0.9, summary, facts: [], zips: [], details: {}, serviceId: null, serviceName: null,
      changes: [{ changeId: id, channel: 'web', capturedAt: new Date('2026-09-30T06:00:00Z'), pageUrl: null, captureId: null, evidenceIds: [], text: 'Before: "x"' }],
    });
    const client = { id: 'c', agencyId: 'a', name: 'A1 HVAC', verticalId: 'v', verticalName: 'HVAC', services: [], serviceNames: [], towns: [], zips: [], competitorNames: [], briefThreshold: 40 };
    const { messages, jsonSchema } = buildWriterPrompt(client, [cand('e1', 'Smith HVAC', 'Smith HVAC cut its tune-up to $69'), cand('e2', 'Jones Air', 'New ad offers 20% off')], [], {
      start: new Date('2026-09-28T00:00:00Z'), end: new Date('2026-10-05T00:00:00Z'),
    });
    const res = await ai.chat('brief_writer', { messages, jsonSchema }, scope(null));
    const draft = JSON.parse(res.text) as { items: { ref: string; headline: string; what_changed: string }[] };
    expect(z.fromJSONSchema(jsonSchema.schema).safeParse(draft).success).toBe(true);
    expect(draft.items.map((i) => i.ref)).toEqual(['C1', 'C2']);
    expect(draft.items[0]!.what_changed).toContain('$69');
    expect(draft.items[1]!.what_changed).toContain('20%');
    expect(draft.items[1]!.what_changed).not.toContain('$69');
  });

  it('latency sampled within p50–p99', async () => {
    const p = { p50: 100, p90: 400, p99: 1000 };
    expect(sampleLatency(p, () => 0)).toBe(100);
    expect(sampleLatency(p, () => 0.9)).toBeCloseTo(400);
    expect(sampleLatency(p, () => 0.99)).toBeCloseTo(1000);
    for (let i = 0; i < 200; i++) {
      const ms = sampleLatency(p, Math.random);
      expect(ms).toBeGreaterThanOrEqual(100);
      expect(ms).toBeLessThanOrEqual(1000);
    }
    const sleeps: number[] = [];
    const { ai } = build({ sleeps, random: () => 0.5 });
    await ai.chat('playbook_writer', { messages: [{ role: 'user', content: 'hi' }] }, scope(null));
    const d = DEFAULT_REHEARSAL_LATENCY;
    expect(sleeps).toHaveLength(1);
    expect(sleeps[0]).toBeGreaterThanOrEqual(d.p50);
    expect(sleeps[0]).toBeLessThanOrEqual(d.p99);
  });

  it('the placeholder latency file parses', async () => {
    const latency = await loadRehearsalLatency();
    for (const v of Object.values(latency)) expect(v.p50 <= v.p90 && v.p90 <= v.p99).toBe(true);
  });
});

describe('rehearsal brief (test DB)', () => {
  const dbs = openTestDbs();
  afterAll(() => dbs.closeAll());

  it('a rehearsal brief for a seeded test client passes verifyDraft with ≥ 1 item', async () => {
    await truncateAll(dbs.owner);
    await seedTenancy(dbs.owner);
    await seedScoredEvent(dbs.service, { competitorId: IDS.competitorX, clientId: IDS.clientA1, agencyId: IDS.agencyA, occurredAt: day(-1), createdAt: day(-1) });
    const { ai } = build();
    const r = await generateBrief({ db: dbs.service, ai, packs: createPackLoader(), generic: () => loadVerticalPack('generic') }, IDS.clientA1, { now: new Date('2026-10-02T03:30:00Z') });
    expect(r).toMatchObject({ status: 'ready', kind: 'standard' });
    const items = await dbs.owner.select().from(briefItem);
    expect(items.length).toBeGreaterThanOrEqual(1);
    expect(items[0]!.whatChanged).toContain('$69');
    expect((await dbs.owner.select().from(brief))[0]!.status).toBe('ready');
  });
});
