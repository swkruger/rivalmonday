import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { casesFile, type EvalCase, readCases, writeCases } from './case';

const mk = (id: string, extra: Partial<EvalCase> = {}): EvalCase => ({
  id, suite: 'briefs', source: 'authored', vertical: 'hvac', blocking: false,
  input: { b: 1, a: [1, 2, { z: null }] }, label: null, labelBy: null, confirmedAt: null, ...extra,
});

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'evals-case-')); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('JSONL cases', () => {
  it('JSONL round trip is byte-stable', () => {
    const cases = [mk('brief-b'), mk('brief-a', { label: { ok: true }, labelBy: 'Sam', confirmedAt: '2026-10-24T10:00:00.000Z' })];
    writeCases('briefs', cases, dir);
    const first = readFileSync(casesFile('briefs', dir), 'utf8');
    expect(first.split('\n')[0]).toContain('"id":"brief-a"'); // sorted by id
    expect(first.endsWith('\n')).toBe(true);
    expect(first).not.toContain('\r');
    writeCases('briefs', readCases('briefs', dir), dir);
    expect(readFileSync(casesFile('briefs', dir), 'utf8')).toBe(first);
  });

  it('invalid case rejected with its line number', () => {
    const good = JSON.stringify(mk('brief-a'));
    const bad = JSON.stringify({ ...mk('brief-b'), id: 'Bad_ID' });
    writeFileSync(casesFile('briefs', dir), `${good}\n${bad}\n`);
    expect(() => readCases('briefs', dir)).toThrow(/briefs\.jsonl line 2: id/);
  });

  it('reports invalid JSON and wrong-suite cases by line', () => {
    writeFileSync(casesFile('briefs', dir), `${JSON.stringify(mk('brief-a'))}\n{nope\n`);
    expect(() => readCases('briefs', dir)).toThrow(/line 2: invalid JSON/);
    writeFileSync(casesFile('briefs', dir), `${JSON.stringify(mk('ask-a', { suite: 'ask' }))}\n`);
    expect(() => readCases('briefs', dir)).toThrow(/line 1: .*belongs to suite "ask"/);
  });

  it('a missing file is an empty suite', () => {
    expect(readCases('changes', dir)).toEqual([]);
  });
});
