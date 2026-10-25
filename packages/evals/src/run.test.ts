import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AiConfig } from '@cs/ai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type EvalCase, writeCases } from './case';
import { runEvals } from './run';
import type { SuiteRunner } from './report';

const mk = (id: string): EvalCase => ({
  id, suite: 'briefs', source: 'authored', vertical: 'hvac', blocking: true, input: {}, label: null, labelBy: null, confirmedAt: null,
});
let dir: string;
const base = () => ({
  mode: 'replay' as const, record: false, maxUsd: 5, updateBaseline: false, config: { tasks: {} } as unknown as AiConfig, env: {},
  reportDir: join(dir, 'report'), dataDir: join(dir, 'data'), cassetteDir: join(dir, 'cass'), baselineDir: join(dir, 'base'), log: () => {},
});
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'evals-run-')); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('runEvals', () => {
  it('a suite with zero cases passes with a no-cases note', async () => {
    const out = await runEvals({ ...base(), suites: ['changes', 'reviews', 'briefs', 'ask'] });
    expect(out.failed).toBe(false);
    expect(out.reports.every((r) => r.note === 'no cases')).toBe(true);
    expect(JSON.parse(readFileSync(join(dir, 'report', 'ask.json'), 'utf8'))).toMatchObject({ suite: 'ask', mode: 'replay', costUsd: 0 });
  });

  it('fails on a blocking failure, computes baselineDelta, and updates the baseline in replay', async () => {
    writeCases('briefs', [mk('brief-a')], join(dir, 'data'));
    const runner = (blocking: boolean): SuiteRunner => ({
      suite: 'briefs',
      run: async () => ({ blocking: blocking ? [{ rule: 'B2', caseId: 'brief-a', detail: 'unsupported' }] : [], metrics: { precision: 0.9 } }),
    });
    const bad = await runEvals({ ...base(), suites: ['briefs'], runners: { briefs: runner(true) }, updateBaseline: true });
    expect(bad.failed).toBe(true);
    expect(bad.reports[0]!.baselineDelta).toBeNull();
    const ok = await runEvals({ ...base(), suites: ['briefs'], runners: { briefs: { suite: 'briefs', run: async () => ({ blocking: [], metrics: { precision: 0.8 } }) } } });
    expect(ok.failed).toBe(false);
    expect(ok.reports[0]!.baselineDelta).toEqual({ precision: -0.1 }); // accuracy drops never fail
  });

  it('case errors block in replay but stay report-only in live', async () => {
    writeCases('briefs', [mk('brief-a')], join(dir, 'data'));
    const runner: SuiteRunner = { suite: 'briefs', run: async () => ({ blocking: [], metrics: { cases: 1, case_errors: 1 } }) };
    const replay = await runEvals({ ...base(), suites: ['briefs'], runners: { briefs: runner } });
    expect(replay.failed).toBe(true);
    expect(replay.reports[0]!.blocking).toEqual([expect.objectContaining({ rule: 'E', detail: expect.stringContaining('1 case(s) errored') })]);
    const live = await runEvals({ ...base(), suites: ['briefs'], mode: 'live', runners: { briefs: runner }, makeLiveAi: () => ({}) as never });
    expect(live.failed).toBe(false);
    expect(live.reports[0]!.blocking).toEqual([]);
    const clean = await runEvals({ ...base(), suites: ['briefs'], runners: { briefs: { suite: 'briefs', run: async () => ({ blocking: [], metrics: { case_errors: 0 } }) } } });
    expect(clean.failed).toBe(false);
  });

  it('a cassette miss in replay is an error (exit 1)', async () => {
    writeCases('briefs', [mk('brief-a')], join(dir, 'data'));
    const config = { tasks: { t: { provider: 'openrouter', model: 'm' } } } as unknown as AiConfig;
    const runner: SuiteRunner = { suite: 'briefs', run: async (_c, ai) => { await ai.chat('t', { messages: [] }, {} as never); return { blocking: [], metrics: {} }; } };
    const out = await runEvals({ ...base(), config, suites: ['briefs'], runners: { briefs: runner } });
    expect(out.failed).toBe(true);
    expect(out.errors[0]).toMatch(/No recorded reply|Re-record/);
  });

  it('cases without a registered runner fail', async () => {
    writeCases('briefs', [mk('brief-a')], join(dir, 'data'));
    const out = await runEvals({ ...base(), suites: ['briefs'], runners: {} });
    expect(out.failed).toBe(true);
  });

  it('live mode stops at the budget and reports cost', async () => {
    writeCases('briefs', [mk('brief-a')], join(dir, 'data'));
    const runner: SuiteRunner = {
      suite: 'briefs',
      run: async (_c, ai) => { for (let i = 0; i < 5; i++) await ai.chat('t', { messages: [] }, {} as never); return { blocking: [], metrics: {} }; },
    };
    let calls = 0;
    const out = await runEvals({
      ...base(), suites: ['briefs'], mode: 'live', maxUsd: 1, runners: { briefs: runner },
      makeLiveAi: (meter) => ({ chat: async () => { calls++; await meter.ledger.recordLlmCall({ costUsd: 0.6 } as never); return {}; } }) as never,
    });
    expect(calls).toBe(2);
    expect(out.failed).toBe(true);
    expect(out.errors[0]).toMatch(/Eval budget reached/);
  });
  it("a runner's today pins the cassette clock, so dated requests replay on a later day", async () => {
    writeCases('briefs', [mk('brief-a')], join(dir, 'data'));
    const config = { tasks: { t: { provider: 'openrouter', model: 'm' } } } as unknown as AiConfig;
    const runner: SuiteRunner = {
      suite: 'briefs', today: '2026-10-19T12:00:00.000Z',
      run: async (_c, ai) => {
        const r = await ai.chat('t', { messages: [{ role: 'user', content: 'Brief period: 2026-10-12 to 2026-10-19' }] }, {} as never);
        return { blocking: [], metrics: { replied: r.text === 'ok 2026-10-14' ? 1 : 0 } };
      },
    };
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(new Date('2026-10-20T00:00:00Z'));
      const rec = await runEvals({
        ...base(), config, suites: ['briefs'], record: true, mode: 'live', runners: { briefs: runner },
        makeLiveAi: () => ({ chat: async () => ({ text: 'ok 2026-10-14' }) }) as never,
      });
      expect(rec.failed).toBe(false);
      vi.setSystemTime(new Date('2026-12-01T00:00:00Z'));
      const out = await runEvals({ ...base(), config, suites: ['briefs'], runners: { briefs: runner } });
      expect(out.errors).toEqual([]);
      expect(out.reports[0]!.metrics).toEqual({ replied: 1 });
    } finally {
      vi.useRealTimers();
    }
  });
});
