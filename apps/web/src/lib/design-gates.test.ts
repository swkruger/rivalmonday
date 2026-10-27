import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SRC_ROOT, sourceFilesUnder } from './page-gates';

// Design system v1 (16a Task 11): retired container classes must not return to any non-test .ts/.tsx in apps/web/src.
const RETIRED = [/shadow-card/, /rounded-\[14px\]/];
const srcFiles = () => sourceFilesUnder(['.']).filter((f) => /[.]tsx?$/.test(f));

describe('design gates', () => {
  it('scans real files', () => {
    expect(srcFiles().length).toBeGreaterThan(50);
  });
  it('no shadow-card or rounded-[14px] in apps/web/src', () => {
    const hits = srcFiles().flatMap((f) =>
      readFileSync(join(SRC_ROOT, f), 'utf8').split('\n').flatMap((line, i) => (RETIRED.some((re) => re.test(line)) ? [`${f}:${i + 1} ${line.trim()}`] : [])),
    );
    expect(hits).toEqual([]);
  });
});
