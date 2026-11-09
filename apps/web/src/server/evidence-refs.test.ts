import type { AccessContext } from '@cs/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { evidenceRefsFor } from './evidence-refs';

const m = vi.hoisted(() => ({ tryCallTool: vi.fn() }));
vi.mock('@/server/tools', () => ({ tryCallTool: m.tryCallTool }));

const ctx = {} as AccessContext;
const C = '11111111-1111-4111-8111-111111111111';
const id = (i: number) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`;

beforeEach(() => { m.tryCallTool.mockReset(); });

describe('evidenceRefsFor', () => {
  it('returns {} for no ids without calling a tool', async () => {
    expect(await evidenceRefsFor(ctx, C, [], 'UTC')).toEqual({});
    expect(await evidenceRefsFor(ctx, C, ['not-a-uuid'], 'UTC')).toEqual({});
    expect(m.tryCallTool).not.toHaveBeenCalled();
  });
  it('returns {} on a refusal or a throw', async () => {
    m.tryCallTool.mockResolvedValueOnce(null);
    expect(await evidenceRefsFor(ctx, C, [id(1)], 'UTC')).toEqual({});
    m.tryCallTool.mockRejectedValueOnce(new Error('boom'));
    expect(await evidenceRefsFor(ctx, C, [id(1)], 'UTC')).toEqual({});
  });
  it('dedupes ids and chunks at 60', async () => {
    m.tryCallTool.mockResolvedValue({ items: [] });
    const ids = Array.from({ length: 61 }, (_, i) => id(i));
    await evidenceRefsFor(ctx, C, [...ids, id(0)], 'UTC');
    expect(m.tryCallTool).toHaveBeenCalledTimes(2);
    expect(m.tryCallTool.mock.calls[0]![1]).toBe('get_evidence_refs');
    expect(m.tryCallTool.mock.calls[0]![2].evidenceIds).toHaveLength(60);
    expect(m.tryCallTool.mock.calls[1]![2].evidenceIds).toHaveLength(1);
  });
  it('requests every chunk concurrently (one stage) and merges all results, a failed chunk only dropping its own ids', async () => {
    let inFlight = 0;
    let peak = 0;
    const release: Array<() => void> = [];
    m.tryCallTool.mockImplementation(async (_c: unknown, _n: string, input: { evidenceIds: string[] }) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise<void>((r) => release.push(r));
      inFlight--;
      if (input.evidenceIds[0] === id(60)) throw new Error('boom');
      return { items: input.evidenceIds.map((e) => ({ evidenceId: e, competitorName: 'R', channelLabel: 'Website', capturedAt: '2020-10-21T12:00:00.000Z' })) };
    });
    const ids = Array.from({ length: 150 }, (_, i) => id(i));
    const p = evidenceRefsFor(ctx, C, ids, 'UTC');
    await new Promise((r) => setTimeout(r, 0));
    expect(m.tryCallTool).toHaveBeenCalledTimes(3);
    expect(peak).toBe(3);
    release.forEach((r) => r());
    const out = await p;
    expect(Object.keys(out)).toHaveLength(90);
    expect(out[id(0)]).toEqual({ source: 'R', channel: 'Website', date: 'Oct 21, 2020' });
    expect(out[id(149)]).toBeDefined();
    expect(out[id(60)]).toBeUndefined();
  });
  it('maps names and formats the date in the given tz', async () => {
    m.tryCallTool.mockResolvedValue({ items: [{ evidenceId: id(1), competitorName: 'Smith HVAC', channelLabel: 'Website', capturedAt: '2020-10-21T02:00:00.000Z' }] });
    const utc = await evidenceRefsFor(ctx, C, [id(1)], 'UTC');
    const chi = await evidenceRefsFor(ctx, C, [id(1)], 'America/Chicago');
    expect(utc[id(1)]).toEqual({ source: 'Smith HVAC', channel: 'Website', date: 'Oct 21, 2020' });
    expect(chi[id(1)]!.date).toBe('Oct 20, 2020');
  });
});
