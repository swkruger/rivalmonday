import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dbStageCounts, recordToolTiming, sequentialStages, type ToolTiming } from './tool-timing';

describe('sequentialStages', () => {
  const s = (startMs: number, endMs: number) => ({ startMs, endMs });
  it.each([
    ['no spans', [], 0],
    ['one span', [s(0, 10)], 1],
    ['two parallel spans (Promise.all)', [s(0, 10), s(1, 12)], 1],
    ['two sequential spans', [s(0, 10), s(11, 20)], 2],
    ['touching spans merge', [s(0, 10), s(10, 20)], 1],
    ['a span inside another', [s(0, 50), s(5, 10), s(20, 30)], 1],
    ['a chain of overlaps is one group', [s(0, 10), s(9, 20), s(19, 30)], 1],
    ['unsorted input', [s(30, 40), s(0, 10), s(5, 12), s(20, 25)], 3],
    ['parallel then sequential then parallel', [s(0, 10), s(0, 8), s(15, 20), s(25, 30), s(26, 35)], 3],
  ])('%s → %i', (_label, spans, want) => {
    expect(sequentialStages(spans)).toBe(want);
  });
});

describe('dbStageCounts', () => {
  const db = (startMs: number, endMs: number, source?: string): ToolTiming => ({ path: '/p', tool: 'select x', startMs, endMs, kind: 'db', ...(source ? { source: source as ToolTiming['source'] } : {}) });
  it('counts dbStages from app spans only (sequentialStages ignores auth and tx spans), auth and tx on their own', () => {
    const spans = [db(0, 10), db(20, 30, 'app'), db(40, 50, 'auth'), db(60, 70, 'auth'), db(80, 90, 'tx'), db(100, 110)];
    expect(dbStageCounts(spans)).toEqual({ dbStages: 3, authStages: 2, txStages: 1, queries: 3 });
  });
  it('treats an absent or unknown source as app, and ignores tool spans', () => {
    const tool: ToolTiming = { path: '/p', tool: 'list_clients', startMs: 0, endMs: 100 };
    expect(dbStageCounts([db(0, 10), db(20, 30, 'weird'), tool])).toEqual({ dbStages: 2, authStages: 0, txStages: 0, queries: 2 });
  });
});

describe('recordToolTiming', () => {
  let dir: string;
  const file = () => join(dir, '.profile', 'tools.ndjson');
  const e = { path: '/agency', tool: 'list_clients', startMs: 1, endMs: 2 };

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'tool-timing-'));
    vi.spyOn(process, 'cwd').mockReturnValue(dir);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    rmSync(dir, { recursive: true, force: true });
  });

  it('no-ops unless PROFILE_TOOLS=1', () => {
    vi.stubEnv('PROFILE_TOOLS', '');
    recordToolTiming(e);
    vi.stubEnv('PROFILE_TOOLS', 'true');
    recordToolTiming(e);
    expect(existsSync(file())).toBe(false);
  });

  it('appends one NDJSON line per call when PROFILE_TOOLS=1', () => {
    vi.stubEnv('PROFILE_TOOLS', '1');
    recordToolTiming(e);
    recordToolTiming({ ...e, tool: 'get_nav_counts' });
    recordToolTiming({ ...e, tool: 'select client', kind: 'db' });
    const lines = readFileSync(file(), 'utf8').trim().split('\n').map((l) => JSON.parse(l) as { tool: string; kind: string });
    expect(lines.map((l) => l.tool)).toEqual(['list_clients', 'get_nav_counts', 'select client']);
    expect(lines[0]).toEqual({ ...e, kind: 'tool' }); // absent kind = tool
    expect(lines[2]!.kind).toBe('db');
  });

  it('writes the source of a db span when set (absent stays absent = app)', () => {
    vi.stubEnv('PROFILE_TOOLS', '1');
    recordToolTiming({ ...e, tool: 'select session', kind: 'db', source: 'auth' });
    recordToolTiming({ ...e, tool: 'select client', kind: 'db' });
    const lines = readFileSync(file(), 'utf8').trim().split('\n').map((l) => JSON.parse(l) as { source?: string });
    expect(lines.map((l) => l.source)).toEqual(['auth', undefined]);
  });

  it('never throws into a request (unwritable location)', () => {
    vi.stubEnv('PROFILE_TOOLS', '1');
    vi.spyOn(process, 'cwd').mockReturnValue(join(dir, '\0bad'));
    expect(() => recordToolTiming(e)).not.toThrow();
  });
});
