import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GATE_EXEMPT, SRC_ROOT, sourceFilesUnder } from './page-gates';

// Design system v1 (16a Task 11): retired container classes must not return to any non-test .tsx in apps/web/src.
const RETIRED = [/shadow-card/, /rounded-\[14px\]/];
const tsxFiles = () => sourceFilesUnder(['.']).filter((f) => f.endsWith('.tsx') && !(f in GATE_EXEMPT));

describe('design gates', () => {
  it('scans real files', () => {
    expect(tsxFiles().length).toBeGreaterThan(50);
  });
  it('no shadow-card or rounded-[14px] in apps/web/src tsx', () => {
    const hits = tsxFiles().flatMap((f) =>
      readFileSync(join(SRC_ROOT, f), 'utf8').split('\n').flatMap((line, i) => (RETIRED.some((re) => re.test(line)) ? [`${f}:${i + 1} ${line.trim()}`] : [])),
    );
    expect(hits).toEqual([]);
  });
});
