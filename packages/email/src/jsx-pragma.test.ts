// Guards the fix in email-runtime.test.ts (apps/worker): every .tsx file in this package
// must carry the JSX pragma itself, since tsx (the production worker's loader) only applies
// jsx: "react-jsx" to files matching the ONE tsconfig nearest its own cwd — a .tsx file here
// missing the pragma would silently crash with "React is not defined" again the moment it's
// rendered from apps/worker, and no other test in this package would notice.
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const PRAGMA = ['/** @jsxRuntime automatic */', '/** @jsxImportSource react */'];
const srcDir = fileURLToPath(new URL('.', import.meta.url));

function findTsxFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.tsx'))
    .map((entry) => path.join(entry.parentPath ?? entry.path, entry.name));
}

describe('jsx pragma', () => {
  const tsxFiles = findTsxFiles(srcDir);

  it('found at least one .tsx file to check', () => {
    expect(tsxFiles.length).toBeGreaterThan(0);
  });

  it.each(tsxFiles.map((file) => [path.relative(srcDir, file), file] as const))('%s starts with the JSX pragma', (_label, file) => {
    const lines = readFileSync(file, 'utf8').split(/\r?\n/);
    expect(lines.slice(0, PRAGMA.length)).toEqual(PRAGMA);
  });
});
