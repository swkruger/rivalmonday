import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { Ai } from './ai';
import { canonicalJson, CassetteMissError, createCassetteAi } from './cassette';
import { parseAiConfig } from './config';

const yaml = (model: string) => `
tasks:
  ask_assistant: { provider: openrouter, model: ${model}, temperature: 0.2 }
`;
const config = parseAiConfig(yaml('a/m1'));
const scope = { agencyId: '00000000-0000-4000-8000-00000000000a', clientId: null };
const dir = mkdtempSync(join(tmpdir(), 'cassette-'));
let n = 0;
const fileOf = () => join(dir, `suite${n++}.json`);

const result = (text: string, toolCalls: unknown[] = []) => ({ text, model: 'a/m1', inputTokens: 1, outputTokens: 1, costUsd: 0, toolCalls });
function fakeInner(reply: () => unknown): { ai: Ai; chat: ReturnType<typeof vi.fn> } {
  const chat = vi.fn(async () => reply());
  return { chat, ai: { chat, chatWithTools: chat } as unknown as Ai };
}
const msgs = (content: string) => [{ role: 'user' as const, content }];

describe('cassette', () => {
  it('replays a recorded chat reply', async () => {
    const file = fileOf();
    const { ai, chat } = fakeInner(() => result('hello'));
    const rec = createCassetteAi(ai, { mode: 'record', file, config });
    await rec.chat('ask_assistant', { messages: msgs('hi') }, scope);
    rec.flush();
    const rep = createCassetteAi(null, { mode: 'replay', file, config });
    expect((await rep.chat('ask_assistant', { messages: msgs('hi') }, scope)).text).toBe('hello');
    expect(chat).toHaveBeenCalledTimes(1);
    expect(rep.stats()).toEqual({ hits: 1, misses: 0, recorded: 0 });
    const raw = readFileSync(file, 'utf8');
    expect(raw.endsWith('\n')).toBe(true);
    expect(raw).not.toContain('\r');
  });

  it("reply ids map to this run's ids", async () => {
    const file = fileOf();
    const u1 = '11111111-1111-4111-8111-111111111111';
    const u2 = '22222222-2222-4222-8222-222222222222';
    const v1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const v2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const { ai } = fakeInner(() => result('', [{ id: 'c1', name: 'get', arguments: JSON.stringify({ id: u1 }) }]));
    const rec = createCassetteAi(ai, { mode: 'record', file, config });
    await rec.chatWithTools('ask_assistant', { messages: msgs(`rows ${u1} ${u2}`), tools: [] }, scope);
    rec.flush();
    const rep = createCassetteAi(null, { mode: 'replay', file, config });
    const out = await rep.chatWithTools('ask_assistant', { messages: msgs(`rows ${v1} ${v2}`), tools: [] }, scope);
    expect(JSON.stringify(out)).toContain(v1);
    expect(JSON.stringify(out)).not.toContain(u1);
  });

  it('an extra row in a tool result misses', async () => {
    const file = fileOf();
    const { ai } = fakeInner(() => result('ok'));
    const rec = createCassetteAi(ai, { mode: 'record', file, config });
    await rec.chat('ask_assistant', { messages: msgs('rows: a') }, scope);
    rec.flush();
    const rep = createCassetteAi(null, { mode: 'replay', file, config });
    const err = await rep.chat('ask_assistant', { messages: msgs('rows: a, b') }, scope).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CassetteMissError);
    expect((err as Error).message).toMatch(/^No recorded reply for ask_assistant \([0-9a-f]{8}\) in .*suite\d+\.json\. Re-record: pnpm --filter @cs\/evals eval record --suite suite\d+$/);
    expect(rep.stats().misses).toBe(1);
  });

  it('changing the task model misses', async () => {
    const file = fileOf();
    const { ai } = fakeInner(() => result('ok'));
    const rec = createCassetteAi(ai, { mode: 'record', file, config });
    await rec.chat('ask_assistant', { messages: msgs('hi') }, scope);
    rec.flush();
    const rep = createCassetteAi(null, { mode: 'replay', file, config: parseAiConfig(yaml('a/m2')) });
    await expect(rep.chat('ask_assistant', { messages: msgs('hi') }, scope)).rejects.toBeInstanceOf(CassetteMissError);
  });

  it('dates replay relative to now', async () => {
    const file = fileOf();
    const { ai } = fakeInner(() => result('due 2026-01-12'));
    const rec = createCassetteAi(ai, { mode: 'record', file, config, now: () => new Date('2026-01-10T12:00:00Z') });
    await rec.chat('ask_assistant', { messages: msgs('since 2026-01-08') }, scope);
    rec.flush();
    const rep = createCassetteAi(null, { mode: 'replay', file, config, now: () => new Date('2026-03-01T01:00:00Z') });
    const out = await rep.chat('ask_assistant', { messages: msgs('since 2026-02-27') }, scope);
    expect(out.text).toBe('due 2026-03-03');
  });

  it('record prunes unused entries', async () => {
    const file = fileOf();
    const { ai } = fakeInner(() => result('x'));
    const first = createCassetteAi(ai, { mode: 'record', file, config });
    await first.chat('ask_assistant', { messages: msgs('old') }, scope);
    first.flush();
    const second = createCassetteAi(ai, { mode: 'record', file, config });
    await second.chat('ask_assistant', { messages: msgs('new') }, scope);
    second.flush();
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as { version: number; entries: Record<string, unknown> };
    expect(parsed.version).toBe(1);
    expect(Object.keys(parsed.entries)).toHaveLength(1);
  });

  it('fill reuses stored responses and records only misses', async () => {
    const file = fileOf();
    const rec = createCassetteAi(fakeInner(() => result('stored A')).ai, { mode: 'record', file, config });
    await rec.chat('ask_assistant', { messages: msgs('A') }, scope);
    rec.flush();
    const { ai, chat } = fakeInner(() => result('live B'));
    const fill = createCassetteAi(ai, { mode: 'fill', file, config });
    expect((await fill.chat('ask_assistant', { messages: msgs('A') }, scope)).text).toBe('stored A');
    expect((await fill.chat('ask_assistant', { messages: msgs('B') }, scope)).text).toBe('live B');
    expect(chat).toHaveBeenCalledTimes(1);
    expect(fill.stats()).toEqual({ hits: 1, misses: 0, recorded: 1 });
    fill.flush();
    const rep = createCassetteAi(null, { mode: 'replay', file, config });
    expect((await rep.chat('ask_assistant', { messages: msgs('A') }, scope)).text).toBe('stored A');
    expect((await rep.chat('ask_assistant', { messages: msgs('B') }, scope)).text).toBe('live B');
  });

  it('fill drops untouched stored entries', async () => {
    const file = fileOf();
    const rec = createCassetteAi(fakeInner(() => result('c')).ai, { mode: 'record', file, config });
    await rec.chat('ask_assistant', { messages: msgs('C') }, scope);
    rec.flush();
    const fill = createCassetteAi(fakeInner(() => result('d')).ai, { mode: 'fill', file, config });
    await fill.chat('ask_assistant', { messages: msgs('D') }, scope);
    fill.flush();
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as { entries: Record<string, { responses: { text: string }[] }> };
    expect(Object.values(parsed.entries).map((e) => e.responses.map((r) => r.text))).toEqual([['d']]);
  });

  it('fill records an extra response when a key is called more times than stored', async () => {
    const file = fileOf();
    const rec = createCassetteAi(fakeInner(() => result('first')).ai, { mode: 'record', file, config });
    await rec.chat('ask_assistant', { messages: msgs('A') }, scope);
    rec.flush();
    const { ai, chat } = fakeInner(() => result('second'));
    const fill = createCassetteAi(ai, { mode: 'fill', file, config });
    expect((await fill.chat('ask_assistant', { messages: msgs('A') }, scope)).text).toBe('first');
    expect((await fill.chat('ask_assistant', { messages: msgs('A') }, scope)).text).toBe('second');
    expect(chat).toHaveBeenCalledTimes(1);
    expect(fill.stats()).toEqual({ hits: 1, misses: 0, recorded: 1 });
    fill.flush();
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as { entries: Record<string, { responses: { text: string }[] }> };
    expect(Object.values(parsed.entries).map((e) => e.responses.map((r) => r.text))).toEqual([['first', 'second']]);
  });

  it('fill mode needs a live Ai', () => {
    expect(() => createCassetteAi(null, { mode: 'fill', file: fileOf(), config })).toThrow(/live Ai/);
  });

  it('canonicalJson ignores key order', () => {
    expect(canonicalJson({ b: 1, a: { d: [1, { y: 1, x: undefined }], c: 2 } })).toBe(canonicalJson({ a: { c: 2, d: [1, { y: 1 }] }, b: 1 }));
  });

  it('replay with inner null never calls the network', async () => {
    const file = fileOf();
    writeFileSync(file, '{"version":1,"entries":{}}\n');
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const rep = createCassetteAi(null, { mode: 'replay', file, config });
    await expect(rep.embed('ask_assistant', ['x'], scope)).rejects.toBeInstanceOf(CassetteMissError);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(rep.batchAvailable('ask_assistant')).toBe(false);
    fetchSpy.mockRestore();
  });
});
