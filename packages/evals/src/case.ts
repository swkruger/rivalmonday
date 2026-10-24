import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

export const SUITES = ['changes', 'reviews', 'briefs', 'ask'] as const;
export type Suite = (typeof SUITES)[number];

export const evalCaseSchema = z.object({
  id: z.string().regex(/^[a-z]+-[a-z0-9-]+$/),
  suite: z.enum(SUITES),
  source: z.enum(['cs_dev', 'golden', 'archive', 'synthetic', 'authored']),
  vertical: z.string(),
  blocking: z.boolean(),
  input: z.unknown(),
  label: z.unknown().nullable(),
  labelBy: z.string().nullable(),
  confirmedAt: z.iso.datetime().nullable(),
});
export type EvalCase = z.infer<typeof evalCaseSchema>;

/** packages/evals (the dir holding data/, cassettes/, baselines/). */
export const PACKAGE_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
export const DATA_DIR = join(PACKAGE_DIR, 'data');
export const CASSETTE_DIR = join(PACKAGE_DIR, 'cassettes');
export const BASELINE_DIR = join(PACKAGE_DIR, 'baselines');

export const casesFile = (suite: Suite, dir = DATA_DIR): string => join(dir, `${suite}.jsonl`);

/** Parses JSONL; a bad line throws naming its 1-based line number. */
export function parseCases(text: string, suite: Suite): EvalCase[] {
  const out: EvalCase[] = [];
  text.split('\n').forEach((line, i) => {
    if (line.trim() === '') return;
    let raw: unknown;
    try {
      raw = JSON.parse(line);
    } catch (err) {
      throw new Error(`${suite}.jsonl line ${i + 1}: invalid JSON (${err instanceof Error ? err.message : String(err)})`);
    }
    const parsed = evalCaseSchema.safeParse(raw);
    if (!parsed.success) {
      throw new Error(`${suite}.jsonl line ${i + 1}: ${parsed.error.issues.map((x) => `${x.path.join('.') || '(case)'}: ${x.message}`).join('; ')}`);
    }
    if (parsed.data.suite !== suite) throw new Error(`${suite}.jsonl line ${i + 1}: case "${parsed.data.id}" belongs to suite "${parsed.data.suite}"`);
    out.push(parsed.data);
  });
  return out;
}

/** A missing file is an empty suite. */
export function readCases(suite: Suite, dir = DATA_DIR): EvalCase[] {
  const file = casesFile(suite, dir);
  return existsSync(file) ? parseCases(readFileSync(file, 'utf8'), suite) : [];
}

export function serializeCases(cases: EvalCase[]): string {
  const sorted = cases.map((c) => evalCaseSchema.parse(c)).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return sorted.map((c) => `${JSON.stringify(c)}\n`).join('');
}

/** JSONL, sorted by id, LF only. */
export function writeCases(suite: Suite, cases: EvalCase[], dir = DATA_DIR): void {
  const file = casesFile(suite, dir);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, serializeCases(cases), 'utf8');
}
