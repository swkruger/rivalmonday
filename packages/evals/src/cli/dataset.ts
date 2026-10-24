import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Ai } from '@cs/ai';
import { DATA_DIR, type EvalCase, readCases, writeCases } from '../case';
import { carryLabels, contactLeaks, type LabelSuite } from '../build/common';
import { buildGolden } from '../build/golden';
import { buildSynthetic } from '../build/synthetic';
import { exportCsv, importCsv } from '../label/csv';
import { prelabelDetailed } from '../label/prelabel';
import type { EvalCommand } from './args';

/** Spec decision 12: changes 120 cs_dev / golden / 120 synthetic dental; reviews 120 cs_dev / 80 synthetic. */
export const BUILD_MIX = { changes: { csDev: 120, synthetic: 120 }, reviews: { csDev: 120, synthetic: 80 } } as const;
export const SYNTHETIC_SEED = 71;

export interface BuildDeps {
  dataDir?: string;
  /** cs_dev reader (the CLI passes buildCsDev over a READ ONLY transaction). */
  csDev: (suite: LabelSuite, limit: number) => Promise<EvalCase[]>;
  log?: (s: string) => void;
}

export async function runBuild(suite: LabelSuite, deps: BuildDeps): Promise<{ total: number; bySource: Record<string, number> }> {
  const log = deps.log ?? console.log;
  const dataDir = deps.dataDir ?? DATA_DIR;
  const mix = BUILD_MIX[suite];
  const built = [...(await deps.csDev(suite, mix.csDev)), ...(suite === 'changes' ? buildGolden() : []), ...buildSynthetic(suite, mix.synthetic, SYNTHETIC_SEED)];
  const ids = new Set<string>();
  for (const c of built) {
    if (ids.has(c.id)) throw new Error(`duplicate case id ${c.id}`);
    ids.add(c.id);
  }
  const cases = carryLabels(readCases(suite, dataDir), built);
  const leaks = contactLeaks(cases);
  if (leaks.length > 0) throw new Error(`refusing to write ${suite}.jsonl: contact details at ${leaks.slice(0, 5).join(', ')}`);
  writeCases(suite, cases, dataDir);
  const bySource = cases.reduce<Record<string, number>>((m, c) => ({ ...m, [c.source]: (m[c.source] ?? 0) + 1 }), {});
  log(`[eval build] ${suite}: ${cases.length} cases (${Object.entries(bySource).map(([k, v]) => `${k} ${v}`).join(', ')}); ${cases.filter((c) => c.confirmedAt).length} confirmed labels kept`);
  return { total: cases.length, bySource };
}

export interface LabelDeps {
  dataDir?: string;
  reportDir: string;
  /** Live, budget-capped Ai (only --prelabel calls it). */
  makeAi?: () => (Ai & { spent?(): number }) | Promise<Ai & { spent?(): number }>;
  log?: (s: string) => void;
  now?: () => Date;
}

export async function runLabel(cmd: Extract<EvalCommand, { cmd: 'label' }>, deps: LabelDeps): Promise<{ failed: boolean }> {
  const log = deps.log ?? console.log;
  const dataDir = deps.dataDir ?? DATA_DIR;
  const suite = cmd.suite as LabelSuite;
  const cases = readCases(suite, dataDir);
  if (cmd.export !== undefined) {
    const csv = exportCsv(cases);
    writeFileSync(cmd.export, csv, 'utf8');
    log(`[eval label] ${suite}: wrote ${csv.split('\n').length - 2} row(s) of ${cases.filter((c) => c.confirmedAt === null).length} unconfirmed case(s) to ${cmd.export}`);
    return { failed: false };
  }
  if (cmd.import !== undefined) {
    const r = importCsv(cases, readFileSync(cmd.import, 'utf8'), cmd.by!, (deps.now ?? (() => new Date()))());
    writeCases(suite, r.cases, dataDir);
    log(`[eval label] ${suite}: confirmed ${r.confirmed} case(s), ${r.changed} row(s) changed from the pre-label`);
    return { failed: false };
  }
  if (!deps.makeAi) throw new Error('--prelabel needs a live Ai');
  const ai = await deps.makeAi();
  const report = await prelabelDetailed(ai, cases);
  writeCases(suite, report.cases, dataDir); // also after a budget stop: nothing paid for is lost
  mkdirSync(deps.reportDir, { recursive: true });
  const { cases: _c, ...summary } = report;
  writeFileSync(join(deps.reportDir, `prelabel-${suite}.json`), `${JSON.stringify({ suite, spentUsd: ai.spent?.() ?? null, ...summary }, null, 2)}\n`, 'utf8');
  log(
    `[eval label] ${suite}: asked ${report.asked}, labelled ${report.labelled}, cross-checked ${report.crossChecked} (${report.mismatches.length} disagreement(s)), ` +
      `failed ${report.failed.length}${ai.spent ? `, spent $${ai.spent().toFixed(4)}` : ''}${report.stopped ? `; stopped: ${report.stopped}` : ''}`,
  );
  return { failed: report.stopped !== null || report.failed.length > 0 };
}
