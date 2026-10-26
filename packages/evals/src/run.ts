import { join } from 'node:path';
import { type Ai, type AiConfig, CassetteMissError, createAiFromEnv, createCassetteAi } from '@cs/ai';
import { BudgetExceededError, budgetedAi, createSpendMeter, type SpendMeter } from './budget';
import { BASELINE_DIR, CASSETTE_DIR, DATA_DIR, readCases, SUITES, type Suite } from './case';
import { askRunner } from './suites/ask/run';
import { briefsRunner } from './suites/briefs/run';
import { changesRunner } from './suites/changes/run';
import { reviewsRunner } from './suites/reviews/run';
import { baselineDelta, type EvalReport, readBaseline, renderMarkdown, type SuiteRunner, writeBaseline, writeReport } from './report';

/** Suite runners register here (Tasks 10-12). A suite with cases but no runner is an error. */
export const RUNNERS: Partial<Record<Suite, SuiteRunner>> = { briefs: briefsRunner, ask: askRunner, changes: changesRunner, reviews: reviewsRunner };

export interface RunOptions {
  suites: Suite[];
  mode: 'replay' | 'live';
  /** Live + cassette record + flush. */
  record: boolean;
  /** With `record`: replay stored replies, go live only on misses (cassette `fill` mode). */
  fill?: boolean;
  maxUsd: number;
  reportDir: string;
  updateBaseline: boolean;
  config: AiConfig;
  env: NodeJS.ProcessEnv;
  dataDir?: string;
  cassetteDir?: string;
  baselineDir?: string;
  runners?: Partial<Record<Suite, SuiteRunner>>;
  /** Test seam: replaces createAiFromEnv in live/record mode. The meter's ledger is what the live Ai must report into. */
  makeLiveAi?: (meter: SpendMeter) => Ai;
  log?: (s: string) => void;
}

export interface RunOutcome { reports: EvalReport[]; failed: boolean; errors: string[] }

export const expandSuites = (s: Suite | 'all'): Suite[] => (s === 'all' ? [...SUITES] : [s]);

/** Exit 1 (failed) on any blocking failure (incl. replay case errors), cassette miss, budget stop or schema error; accuracy deltas never fail. */
export async function runEvals(o: RunOptions): Promise<RunOutcome> {
  const log = o.log ?? ((s: string) => console.log(s));
  const runners = o.runners ?? RUNNERS;
  const reports: EvalReport[] = [];
  const errors: string[] = [];
  const live = o.mode === 'live' || o.record;
  const mode = live ? 'live' : 'replay';
  // One meter and one cap across all suites of this invocation.
  const meter = createSpendMeter();
  let liveAi: (Ai & { spent(): number }) | null = null;
  const ensureLive = () =>
    (liveAi ??= budgetedAi(
      o.makeLiveAi ? o.makeLiveAi(meter) : createAiFromEnv({ ...o.env, AI_SHADOW_RATE: '0' }, o.config, meter.ledger),
      o.maxUsd,
      meter,
    ));

  for (const suite of o.suites) {
    try {
      const cases = readCases(suite, o.dataDir ?? DATA_DIR);
      if (cases.length === 0) {
        const r: EvalReport = { suite, mode, costUsd: 0, blocking: [], metrics: {}, baselineDelta: null, note: 'no cases' };
        reports.push(r);
        writeReport(r, o.reportDir);
        log(renderMarkdown(r));
        continue;
      }
      const runner = runners[suite];
      if (!runner) throw new Error(`${cases.length} case(s) but no runner is registered`);
      const file = join(o.cassetteDir ?? CASSETTE_DIR, `${suite}.json`);
      const before = meter.spent();
      const today = runner.today;
      const now = today ? () => new Date(today) : undefined;
      const cassette = o.record
        ? createCassetteAi(ensureLive(), { mode: o.fill ? 'fill' : 'record', file, config: o.config, now })
        : o.mode === 'replay'
          ? createCassetteAi(null, { mode: 'replay', file, config: o.config, now })
          : null;
      const result = await runner.run(cases, cassette ?? ensureLive(), { mode });
      cassette?.flush();
      if (o.record && o.fill && cassette) {
        const st = cassette.stats();
        log(`[eval] fill ${suite}: hits ${st.hits}, recorded ${st.recorded}, misses ${st.misses}, live spend $${(meter.spent() - before).toFixed(4)}`);
      }
      const bdir = o.baselineDir ?? BASELINE_DIR;
      const caseErrors = result.metrics.case_errors ?? 0;
      // Replay is deterministic: an errored case is a regression, not a flake. Live keeps errors report-only.
      const blocking = mode === 'replay' && caseErrors > 0
        ? [...result.blocking, { rule: 'E' as const, caseId: `${suite}:*`, detail: `${caseErrors} case(s) errored in replay` }]
        : result.blocking;
      const report: EvalReport = {
        suite,
        mode,
        costUsd: Math.round((meter.spent() - before) * 1e6) / 1e6,
        ...result,
        blocking,
        baselineDelta: baselineDelta(result.metrics, readBaseline(suite, bdir)),
      };
      if (o.updateBaseline && !live) writeBaseline(suite, result.metrics, bdir);
      reports.push(report);
      writeReport(report, o.reportDir);
      log(renderMarkdown(report));
    } catch (err) {
      errors.push(`${suite}: ${err instanceof Error ? err.message : String(err)}`);
      if (err instanceof BudgetExceededError) break;
      if (err instanceof CassetteMissError) continue;
    }
  }
  return { reports, failed: errors.length > 0 || reports.some((r) => r.blocking.length > 0), errors };
}
