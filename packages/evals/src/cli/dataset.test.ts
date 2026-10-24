import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Ai } from '@cs/ai';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type EvalCase, readCases, writeCases } from '../case';
import { changeRowsToCases } from '../build/cs-dev';
import { BUILD_MIX, runBuild, runLabel } from './dataset';

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'evals-dataset-')); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const csDevRow = { competitorName: 'Acme Dental', pageUrl: null, pageType: 'home', kind: 'added', beforeText: null, afterText: 'Now offering implants', numericChanges: [], verticalIds: ['dental'] };

describe('eval build / label', () => {
  it('build mixes cs_dev, golden and synthetic, and keeps confirmed labels for unchanged inputs', async () => {
    const csDev = async (_s: 'changes' | 'reviews', limit: number) => {
      expect(limit).toBe(BUILD_MIX.changes.csDev);
      return changeRowsToCases([csDevRow]);
    };
    const first = await runBuild('changes', { dataDir: dir, csDev, log: () => {} });
    const cases = readCases('changes', dir);
    expect(cases).toHaveLength(first.total);
    expect(new Set(cases.map((c) => c.source))).toEqual(new Set(['cs_dev', 'golden', 'synthetic']));
    expect(cases.filter((c) => c.source === 'synthetic')).toHaveLength(BUILD_MIX.changes.synthetic);

    const id = cases.find((c) => c.source === 'cs_dev')!.id;
    writeCases('changes', cases.map((c) => (c.id === id ? { ...c, label: { meaningful: 'true' }, labelBy: 'owner', confirmedAt: '2026-10-24T00:00:00.000Z' } : c)), dir);
    await runBuild('changes', { dataDir: dir, csDev, log: () => {} });
    expect(readCases('changes', dir).find((c) => c.id === id)).toMatchObject({ labelBy: 'owner' });
  });

  it('reviews build has no golden cases', async () => {
    await runBuild('reviews', { dataDir: dir, csDev: async () => [], log: () => {} });
    const cases = readCases('reviews', dir);
    expect(cases).toHaveLength(BUILD_MIX.reviews.synthetic);
  });

  it('label --export / --import round trip through files; --prelabel writes cases and a report', async () => {
    writeCases('changes', changeRowsToCases([csDevRow]), dir);
    const keys = (readCases('changes', dir)[0]!.input as { questionKeys: string[] }).questionKeys;
    const answer = JSON.stringify(Object.fromEntries(keys.map((k) => [k, k === 'meaningful' ? 'true' : k === 'change_type' ? 'new_service' : 'implants'])));
    const ai = { chat: async () => ({ text: answer, model: 'anthropic/claude-sonnet-5' }) } as unknown as Ai;
    const reportDir = join(dir, 'report');
    const pre = await runLabel({ cmd: 'label', suite: 'changes', prelabel: true }, { dataDir: dir, reportDir, makeAi: () => ai, log: () => {} });
    expect(pre.failed).toBe(false);
    expect(readCases('changes', dir)[0]).toMatchObject({ labelBy: 'llm:anthropic/claude-sonnet-5', label: { service_dental: 'implants' } });
    expect(JSON.parse(readFileSync(join(reportDir, 'prelabel-changes.json'), 'utf8'))).toMatchObject({ labelled: 1, failed: [] });

    const csv = join(dir, 'l.csv');
    await runLabel({ cmd: 'label', suite: 'changes', prelabel: false, export: csv }, { dataDir: dir, reportDir, log: () => {} });
    writeFileSync(csv, readFileSync(csv, 'utf8').replace(/,implants\n/, ',none\n'));
    await runLabel({ cmd: 'label', suite: 'changes', prelabel: false, import: csv, by: 'owner' }, { dataDir: dir, reportDir, log: () => {} });
    const [c] = readCases('changes', dir) as EvalCase[];
    expect(c).toMatchObject({ labelBy: 'owner', label: { service_dental: 'none' } });
    expect(c!.confirmedAt).not.toBeNull();
  });
});
