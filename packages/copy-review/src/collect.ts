import { globSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { scanMarkdownFile } from './scan/markdown.js';
import { scanTsFile } from './scan/ts-scan.js';
import { ruleFor, SOURCES } from './sources.js';
import type { CopyItem } from './types.js';

/** JSON content is scanned as a TS module: `const json = <file>` keeps line numbers (prefix on line 1). */
const JSON_PREFIX = 'const json = ';

/** Every repo-relative file (forward slashes) some source rule includes, sorted. */
export function listSourceFiles(root: string): string[] {
  const files = new Set<string>();
  for (const rule of SOURCES) {
    for (const f of globSync(rule.include as string[], { cwd: root })) files.add(f.replace(/\\/g, '/'));
  }
  return [...files].sort();
}

/** Scan every source file in the repo at `root` (first matching rule per file); sorted by surface, file, line. */
export function collectScanned(root: string): CopyItem[] {
  const items: CopyItem[] = [];
  for (const file of listSourceFiles(root)) {
    const rule = ruleFor(file);
    if (!rule) continue;
    const source = readFileSync(join(root, file), 'utf8');
    if (rule.mode === 'markdown') items.push(scanMarkdownFile(file, source, rule.surface));
    else items.push(...scanTsFile(file, file.endsWith('.json') ? JSON_PREFIX + source : source, rule));
  }
  const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  return items.sort((a, b) => cmp(a.surface, b.surface) || cmp(a.file, b.file) || a.line - b.line);
}
