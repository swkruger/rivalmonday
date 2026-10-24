import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Ai } from '@cs/ai';
import { BASELINE_DIR, type EvalCase, type Suite } from './case';

export interface BlockingFailure { rule: 'B1' | 'B2' | 'B3'; caseId: string; detail: string }
export interface EvalReport {
  suite: Suite;
  mode: 'replay' | 'live';
  costUsd: number;
  blocking: BlockingFailure[];
  metrics: Record<string, number>;
  baselineDelta: Record<string, number> | null;
  /** Human note, e.g. "no cases". */
  note?: string;
}
export interface RunContext { mode: 'replay' | 'live' }
export interface SuiteRunner {
  suite: Suite;
  run(cases: EvalCase[], ai: Ai, ctx: RunContext): Promise<Omit<EvalReport, 'suite' | 'mode' | 'costUsd' | 'baselineDelta'>>;
}

const round = (n: number) => Math.round(n * 1e6) / 1e6;

export function readBaseline(suite: Suite, dir = BASELINE_DIR): Record<string, number> | null {
  const file = join(dir, `${suite}.json`);
  return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as Record<string, number>) : null;
}

export function writeBaseline(suite: Suite, metrics: Record<string, number>, dir = BASELINE_DIR): void {
  mkdirSync(dir, { recursive: true });
  const sorted = Object.fromEntries(Object.entries(metrics).sort(([a], [b]) => (a < b ? -1 : 1)));
  writeFileSync(join(dir, `${suite}.json`), `${JSON.stringify(sorted, null, 2)}\n`, 'utf8');
}

/** metrics minus baseline, for metrics present in both; null without a baseline. */
export function baselineDelta(metrics: Record<string, number>, baseline: Record<string, number> | null): Record<string, number> | null {
  if (!baseline) return null;
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(metrics)) if (k in baseline) out[k] = round(v - baseline[k]!);
  return out;
}

export function writeReport(report: EvalReport, reportDir: string): string {
  const file = join(reportDir, `${report.suite}.json`);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  return file;
}

export function renderMarkdown(r: EvalReport): string {
  const lines = [`### ${r.suite} (${r.mode}) - ${r.blocking.length === 0 ? 'pass' : `${r.blocking.length} blocking failure(s)`}`, `Cost: $${r.costUsd.toFixed(4)}`];
  if (r.note) lines.push(r.note);
  for (const f of r.blocking) lines.push(`- ${f.rule} ${f.caseId}: ${f.detail}`);
  const keys = Object.keys(r.metrics).sort();
  if (keys.length) {
    lines.push('', '| metric | value | vs baseline |', '| --- | --- | --- |');
    for (const k of keys) {
      const d = r.baselineDelta?.[k];
      lines.push(`| ${k} | ${r.metrics[k]} | ${d === undefined ? '-' : `${d >= 0 ? '+' : ''}${d}`} |`);
    }
  }
  return lines.join('\n');
}
