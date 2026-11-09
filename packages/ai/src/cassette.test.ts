import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { Ai } from './ai';
import { canonicalJson, CassetteMissError, cassetteKey, createCassetteAi, normalize, stripImages } from './cassette';
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

  describe('images (18a-3 D3)', () => {
    const b64 = Buffer.from('SECRET-IMAGE-BYTES-0123456789').toString('base64');
    const img = (sha: string) => ({ mediaType: 'image/png' as const, data: new Uint8Array(Buffer.from('SECRET-IMAGE-BYTES-0123456789')), sha256: sha });
    const imgMsgs = (sha: string) => [{ role: 'user' as const, content: [{ type: 'text' as const, text: 'look' }, { type: 'image' as const, image: img(sha) }] }];
    const dconfig = parseAiConfig(`
tasks:
  tag_decisions: { provider: openrouter, model: a/m1, mode: decisions }
  ask_assistant: { provider: openrouter, model: a/m1, temperature: 0.2 }
`);
    const q = { q: { type: 'noul' as const, instructions: 'x' } };

    it('recorded file contains the image sha256 and no base64/data: URL/bytes of the image', async () => {
      const file = fileOf();
      const inner = { chat: vi.fn(async () => result('ok')), decide: vi.fn(async () => ({ answers: {}, model: 'm' })) } as unknown as Ai;
      const rec = createCassetteAi(inner, { mode: 'record', file, config: dconfig });
      await rec.chat('ask_assistant', { messages: imgMsgs('s'.repeat(64)) } as never, scope);
      await rec.decide('tag_decisions', { a: 1 }, q, scope, { images: [img('t'.repeat(64))] });
      rec.flush();
      const raw = readFileSync(file, 'utf8');
      expect(raw).not.toContain(b64);
      expect(raw).not.toContain('data:image');
      expect(raw).not.toContain('SECRET-IMAGE');
      const rep = createCassetteAi(null, { mode: 'replay', file, config: dconfig });
      await rep.chat('ask_assistant', { messages: imgMsgs('s'.repeat(64)) } as never, scope);
      await rep.decide('tag_decisions', { a: 1 }, q, scope, { images: [img('t'.repeat(64))] });
      expect(rep.stats().hits).toBe(2);
    });

    it('same image bytes, different sha => different key', async () => {
      const file = fileOf();
      const inner = { chat: vi.fn(async () => result('ok')) } as unknown as Ai;
      const rec = createCassetteAi(inner, { mode: 'record', file, config: dconfig });
      await rec.chat('ask_assistant', { messages: imgMsgs('1'.repeat(64)) } as never, scope);
      rec.flush();
      const rep = createCassetteAi(null, { mode: 'replay', file, config: dconfig });
      await expect(rep.chat('ask_assistant', { messages: imgMsgs('2'.repeat(64)) } as never, scope)).rejects.toBeInstanceOf(CassetteMissError);
    });

    it('stripImages maps image parts and raw bytes', () => {
      expect(stripImages([{ type: 'image', image: { sha256: 'x', data: new Uint8Array(2) } }, new Uint8Array(3), { a: 'b' }])).toEqual([{ type: 'image', sha256: 'x' }, { bytes: 3 }, { a: 'b' }]);
    });

    it('image-less request key unchanged (fixture key from before the change)', async () => {
      const cfg = parseAiConfig(`
tasks:
  ask_assistant: { provider: openrouter, model: a/m1, temperature: 0.2 }
  tag_decisions: { provider: openrouter, model: a/m1, mode: decisions }
`);
      const t = new Date('2026-01-01T00:00:00Z');
      const k = (task: string, kind: 'chat' | 'decide', req: unknown) => cassetteKey(cfg, task, kind, normalize(canonicalJson(req), new Map(), t));
      expect(k('ask_assistant', 'chat', { messages: [{ role: 'user', content: 'hi' }], jsonSchema: undefined })).toBe('e3daa9de84d3f66ef9ef4e09b66f0b0235516269d16bc4ec0e1d99d0dc32f301');
      const dec = 'e7b255587f604a4cbeeaea557dfecccea98fc83f98b08aa8d41a247dff6330a9';
      expect(k('tag_decisions', 'decide', { state: { a: 1 }, questions: { q: { type: 'noul', instructions: 'x' } } })).toBe(dec);
      // through the wrapper: an image-less decide (new `images: undefined` field) hashes the same
      const file = fileOf();
      const inner = { decide: vi.fn(async () => ({ answers: {}, model: 'm' })) } as unknown as Ai;
      const rec = createCassetteAi(inner, { mode: 'record', file, config: cfg, now: () => t });
      await rec.decide('tag_decisions', { a: 1 }, { q: { type: 'noul', instructions: 'x' } }, scope);
      rec.flush();
      expect(Object.keys(JSON.parse(readFileSync(file, 'utf8')).entries)).toEqual([dec]);
    });
  });
});
