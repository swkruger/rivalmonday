import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { strToU8, zipSync } from 'fflate';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { listFiles, unzipTo, zipDirectory } from './zip';

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'zip-'));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('evidence zip', () => {
  it('round-trips a nested directory and counts files and bytes', async () => {
    const src = join(root, 'src');
    mkdirSync(join(src, 'evidence', 'c1'), { recursive: true });
    writeFileSync(join(src, 'evidence', 'c1', 'page.html'), '<p>x</p>');
    writeFileSync(join(src, 'a.txt'), 'hello');
    const stats = await zipDirectory(src, join(root, 'e.zip'));
    expect(stats).toEqual({ files: 2, bytes: 13 });
    expect(await unzipTo(join(root, 'e.zip'), join(root, 'out'))).toBe(2);
    expect(readFileSync(join(root, 'out', 'evidence', 'c1', 'page.html'), 'utf8')).toBe('<p>x</p>');
    expect((await listFiles(join(root, 'out'))).sort()).toEqual(['a.txt', 'evidence/c1/page.html']);
  });

  it('treats a missing directory as empty', async () => {
    expect(await zipDirectory(join(root, 'nope'), join(root, 'e.zip'))).toEqual({ files: 0, bytes: 0 });
  });

  it('refuses entries that would escape the target directory', async () => {
    writeFileSync(join(root, 'bad.zip'), zipSync({ '../evil.txt': strToU8('x') }));
    await expect(unzipTo(join(root, 'bad.zip'), join(root, 'out'))).rejects.toThrow(/Unsafe path/);
  });
});
