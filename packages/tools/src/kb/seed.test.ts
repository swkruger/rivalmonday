import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { lintKbText } from '@cs/core';
import { kbArticle, kbChunk } from '@cs/db';
import { openTestDbs, truncateAll } from '@cs/db/test-helpers';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { parseSeedFile, seedKnowledge } from './seed';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
let dir: string;
beforeEach(async () => {
  await truncateAll(dbs.owner);
  dir = await mkdtemp(join(tmpdir(), 'kb-seed-'));
  return async () => rm(dir, { recursive: true, force: true });
});

const file = (key: string, body = '# Hello\n\nSome words here.', title = `Title ${key}`) => `---\nseed_key: ${key}\ntitle: ${title}\n---\n${body}\n`;
const put = (name: string, text: string) => writeFile(join(dir, name), text);
const rows = () => dbs.service.select().from(kbArticle);

describe('seedKnowledge', () => {
  it('fresh seed creates platform published seed rows with chunks', async () => {
    for (const k of ['a', 'b', 'c']) await put(`${k}.md`, file(k));
    expect(await seedKnowledge(dbs.service, dir)).toEqual({ created: 3, updated: 0, removed: 0, unchanged: 0 });
    const all = await rows();
    expect(all).toHaveLength(3);
    expect(all[0]).toMatchObject({ level: 'platform', status: 'published', source: 'seed', kind: 'help', createdBy: 'system:seed' });
    expect(await dbs.service.select().from(kbChunk)).not.toHaveLength(0);
  });

  it('re-run reports everything unchanged and writes nothing', async () => {
    await put('a.md', file('a'));
    await seedKnowledge(dbs.service, dir);
    const before = (await rows())[0]!.updatedAt;
    expect(await seedKnowledge(dbs.service, dir)).toEqual({ created: 0, updated: 0, removed: 0, unchanged: 1 });
    expect((await rows())[0]!.updatedAt).toEqual(before);
  });

  it('an edited file updates the row and rechunks', async () => {
    await put('a.md', file('a'));
    await seedKnowledge(dbs.service, dir);
    await put('a.md', file('a', '# New\n\nCompletely different words.'));
    expect(await seedKnowledge(dbs.service, dir)).toMatchObject({ created: 0, updated: 1 });
    const [a] = await rows();
    expect(a!.bodyMd).toContain('Completely different');
    const text = (await dbs.service.select().from(kbChunk).where(eq(kbChunk.articleId, a!.id))).map((c) => c.text).join('\n');
    expect(text).toContain('Completely different');
    expect(text).not.toContain('Some words here');
  });

  it('a removed file removes its seed row but not manual rows', async () => {
    await put('a.md', file('a'));
    await put('b.md', file('b'));
    await seedKnowledge(dbs.service, dir);
    await dbs.service.insert(kbArticle).values({ level: 'platform', kind: 'help', title: 'M', bodyMd: 'x', status: 'published', source: 'manual', createdBy: 'op', updatedBy: 'op' });
    await rm(join(dir, 'b.md'));
    expect(await seedKnowledge(dbs.service, dir)).toMatchObject({ removed: 1, unchanged: 1 });
    expect((await rows()).map((r) => r.seedKey).sort()).toEqual(['a', null]);
  });

  it('bad front-matter throws naming the file and writes nothing', async () => {
    await put('a.md', file('a'));
    await put('bad.md', '---\nseed_key: Bad Key\ntitle: T\n---\nbody\n');
    await expect(seedKnowledge(dbs.service, dir)).rejects.toThrow(/bad\.md/);
    expect(await rows()).toHaveLength(0);
  });

  it('parseSeedFile rejects missing title, unknown kind and missing block', () => {
    expect(() => parseSeedFile('x.md', '---\nseed_key: a\n---\nb')).toThrow(/x\.md/);
    expect(() => parseSeedFile('x.md', '---\nseed_key: a\ntitle: T\nkind: nope\n---\nb')).toThrow(/x\.md/);
    expect(() => parseSeedFile('x.md', 'no front matter')).toThrow(/x\.md/);
  });

  it('rejects duplicate seed_keys', async () => {
    await put('a.md', file('same'));
    await put('b.md', file('same'));
    await expect(seedKnowledge(dbs.service, dir)).rejects.toThrow(/same/);
  });
});

describe('shipped docs/help', () => {
  const helpDir = join(__dirname, '../../../../docs/help');
  it('every file lints clean, is short, and seeds', async () => {
    const names = (await readdir(helpDir)).filter((n) => n.endsWith('.md'));
    expect(names.length).toBeGreaterThanOrEqual(3);
    for (const n of names) {
      const a = parseSeedFile(n, await readFile(join(helpDir, n), 'utf8'));
      expect(lintKbText('platform', `${a.title}\n${a.body}`), n).toEqual([]);
      expect(a.body.split(/\s+/).length, n).toBeLessThanOrEqual(400);
    }
    expect((await seedKnowledge(dbs.service, helpDir)).created).toBe(names.length);
  });
});
