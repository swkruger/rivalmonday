import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GLOSSARY, lintKbText } from '@cs/core';
import { agency, kbArticle, kbChunk } from '@cs/db';
import { openTestDbs, truncateAll } from '@cs/db/test-helpers';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { parseSeedFile, seedKnowledge } from './seed';
import type { GlossaryTerm } from '@cs/core';

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
/** Plain-article cases seed no glossary rows (the real glossary is covered by `help-content.test.ts`). */
const NO_GLOSSARY = { glossary: [] };

describe('seedKnowledge', () => {
  it('fresh seed creates platform published seed rows with chunks', async () => {
    for (const k of ['a', 'b', 'c']) await put(`${k}.md`, file(k));
    expect(await seedKnowledge(dbs.service, dir, 'system:seed', NO_GLOSSARY)).toEqual({ created: 3, updated: 0, removed: 0, unchanged: 0 });
    const all = await rows();
    expect(all).toHaveLength(3);
    expect(all[0]).toMatchObject({ level: 'platform', status: 'published', source: 'seed', kind: 'help', createdBy: 'system:seed' });
    expect(await dbs.service.select().from(kbChunk)).not.toHaveLength(0);
  });

  it('re-run reports everything unchanged and writes nothing', async () => {
    await put('a.md', file('a'));
    await seedKnowledge(dbs.service, dir, 'system:seed', NO_GLOSSARY);
    const before = (await rows())[0]!.updatedAt;
    expect(await seedKnowledge(dbs.service, dir, 'system:seed', NO_GLOSSARY)).toEqual({ created: 0, updated: 0, removed: 0, unchanged: 1 });
    expect((await rows())[0]!.updatedAt).toEqual(before);
  });

  it('an edited file updates the row and rechunks', async () => {
    await put('a.md', file('a'));
    await seedKnowledge(dbs.service, dir, 'system:seed', NO_GLOSSARY);
    await put('a.md', file('a', '# New\n\nCompletely different words.'));
    expect(await seedKnowledge(dbs.service, dir, 'system:seed', NO_GLOSSARY)).toMatchObject({ created: 0, updated: 1 });
    const [a] = await rows();
    expect(a!.bodyMd).toContain('Completely different');
    const text = (await dbs.service.select().from(kbChunk).where(eq(kbChunk.articleId, a!.id))).map((c) => c.text).join('\n');
    expect(text).toContain('Completely different');
    expect(text).not.toContain('Some words here');
  });

  it('a removed file removes its seed row but not manual rows', async () => {
    await put('a.md', file('a'));
    await put('b.md', file('b'));
    await seedKnowledge(dbs.service, dir, 'system:seed', NO_GLOSSARY);
    await dbs.service.insert(kbArticle).values({ level: 'platform', kind: 'help', title: 'M', bodyMd: 'x', status: 'published', source: 'manual', createdBy: 'op', updatedBy: 'op' });
    await rm(join(dir, 'b.md'));
    expect(await seedKnowledge(dbs.service, dir, 'system:seed', NO_GLOSSARY)).toMatchObject({ removed: 1, unchanged: 1 });
    expect((await rows()).map((r) => r.seedKey).sort()).toEqual(['a', null]);
  });

  it('bad front-matter throws naming the file and writes nothing', async () => {
    await put('a.md', file('a'));
    await put('bad.md', '---\nseed_key: Bad Key\ntitle: T\n---\nbody\n');
    await expect(seedKnowledge(dbs.service, dir, 'system:seed', NO_GLOSSARY)).rejects.toThrow(/bad\.md/);
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
    await expect(seedKnowledge(dbs.service, dir, 'system:seed', NO_GLOSSARY)).rejects.toThrow(/same/);
  });
});

describe('page guides and glossary', () => {
  const sections = (extra = '') => `## What this page tells you\n\nIt shows things.\n\n## How to use it\n\nLook at them.\n\n## Common questions\n\nNone yet.\n${extra}`;
  const guide = (key: string, audience: string, body = sections(), title = 'A guide') => `---\nhelp_key: ${key}\naudience: ${audience}\ntitle: ${title}\n---\n${body}\n`;
  const putGuide = async (name: string, text: string) => {
    await mkdir(join(dir, 'pages'), { recursive: true });
    await writeFile(join(dir, 'pages', name), text);
  };
  const terms: GlossaryTerm[] = [
    { id: 'pressure', term: 'Pressure', audience: 'all', short: 'How hard rivals are pushing.', long: 'More detail.' },
    { id: 'seats', term: 'Seats', audience: 'agency', short: 'Billable users.' },
  ];
  const seed = (glossary: readonly GlossaryTerm[] = []) => seedKnowledge(dbs.service, dir, 'system:seed', { glossary });
  const failure = async (glossary: readonly GlossaryTerm[] = []) => (await seed(glossary).then(() => null, (e: Error) => e))?.message ?? '';

  it('seeds a client and an agency guide plus glossary rows with the right keys and visibility', async () => {
    await putGuide('client.reviews.client.md', guide('page:client.reviews', 'client'));
    await putGuide('agency.team.md', guide('page:agency.team', 'agency'));
    await put('a.md', file('a'));
    expect(await seed(terms)).toEqual({ created: 5, updated: 0, removed: 0, unchanged: 0 });
    const by = Object.fromEntries((await rows()).map((r) => [r.seedKey, r]));
    expect(by['page:client.reviews#client']).toMatchObject({ helpKey: 'page:client.reviews', audience: 'client', clientVisible: true, level: 'platform', status: 'published', kind: 'help', source: 'seed' });
    expect(by['page:agency.team#agency']).toMatchObject({ audience: 'agency', clientVisible: false });
    expect(by['glossary:pressure#all']).toMatchObject({ helpKey: 'glossary:pressure', title: 'Pressure', bodyMd: 'How hard rivals are pushing.\n\nMore detail.', clientVisible: true });
    expect(by['glossary:seats#agency']).toMatchObject({ bodyMd: 'Billable users.', clientVisible: false });
    expect(by.a).toMatchObject({ helpKey: null, audience: 'all' });
    expect(await dbs.service.select().from(kbChunk)).not.toHaveLength(0);
  });

  it('re-run is unchanged and an edit updates', async () => {
    await putGuide('client.reviews.md', guide('page:client.reviews', 'client'));
    await seed(terms);
    expect(await seed(terms)).toEqual({ created: 0, updated: 0, removed: 0, unchanged: 3 });
    await putGuide('client.reviews.md', guide('page:client.reviews', 'client', sections('\nMore words.')));
    expect(await seed([terms[0]!, { ...terms[1]!, short: 'Changed.' }])).toEqual({ created: 0, updated: 2, removed: 0, unchanged: 1 });
  });

  it('removing a guide or glossary term removes only its seed row', async () => {
    await putGuide('client.reviews.md', guide('page:client.reviews', 'client'));
    await putGuide('agency.team.md', guide('page:agency.team', 'agency'));
    await seed(terms);
    const [ag] = await dbs.owner.insert(agency).values({ name: 'Ag' }).returning();
    await dbs.service.insert(kbArticle).values({ level: 'agency', agencyId: ag!.id, kind: 'help', title: 'Mine', bodyMd: 'x', status: 'published', source: 'manual', helpKey: 'page:agency.team', audience: 'agency', createdBy: 'op', updatedBy: 'op' });
    await rm(join(dir, 'pages', 'agency.team.md'));
    expect(await seed([terms[0]!])).toMatchObject({ removed: 2, unchanged: 2 });
    expect((await rows()).map((r) => r.seedKey).sort()).toEqual(['glossary:pressure#all', null, 'page:client.reviews#client']);
  });

  it('a missing pages folder is fine', async () => {
    await put('a.md', file('a'));
    expect(await seed()).toMatchObject({ created: 1 });
  });

  it('reports every validation error at once and writes nothing', async () => {
    await putGuide('client.reviews.md', guide('page:client.other', 'client'));
    await putGuide('x.md', guide('page:x', 'nobody'));
    await putGuide('y.md', guide('page:y', 'client', '## How to use it\n\nx\n\n## What this page tells you\n\ny\n\n## Common questions\n\nz'));
    await putGuide('z.md', guide('page:z', 'client', sections('\nAsk Friday about Rival Monday.')));
    await putGuide('w.agency.md', guide('page:w', 'client'));
    await putGuide('Bad_Key.md', guide('page:Bad_Key', 'client'));
    const msg = await failure();
    expect(msg).toMatch(/client\.reviews\.md: help_key "page:client\.other" must be "page:client\.reviews"/);
    expect(msg).toMatch(/x\.md: unknown audience "nobody"/);
    expect(msg).toMatch(/y\.md: H2 sections must be exactly/);
    expect(msg).toMatch(/z\.md: Uses "Rival Monday"/);
    expect(msg).toMatch(/z\.md: Uses "Friday"/);
    expect(msg).toMatch(/w\.agency\.md: file-name audience "agency" does not match/);
    expect(msg).toMatch(/Bad_Key\.md: help_key "page:Bad_Key" must match \^page:\[a-z0-9\.-\]\+\$/);
    expect(await rows()).toHaveLength(0);
  });

  it('rejects a missing section and a duplicate key+audience', async () => {
    await putGuide('a.md', guide('page:a', 'all', '## What this page tells you\n\nx\n\n## How to use it\n\ny'));
    await putGuide('a.all.md', guide('page:a', 'all'));
    await putGuide('a.client.md', guide('page:a', 'client'));
    const msg = await failure([terms[0]!, terms[0]!]);
    expect(msg).toMatch(/a\.md: H2 sections/);
    expect(msg).toMatch(/glossary:pressure: duplicate key\+audience "glossary:pressure#all"/);
  });

  it('rejects duplicate guides for one key and audience', async () => {
    await putGuide('a.md', guide('page:a', 'client'));
    await putGuide('a.client.md', guide('page:a', 'client'));
    expect(await failure()).toMatch(/duplicate key\+audience "page:a#client"/);
  });

  it('lints glossary text', async () => {
    expect(await failure([{ id: 'g', term: 'G', audience: 'all', short: 'Ask Friday.' }])).toMatch(/glossary:g: Uses "Friday"/);
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
    const guides = (await readdir(join(helpDir, 'pages'))).filter((n) => n.endsWith('.md'));
    expect((await seedKnowledge(dbs.service, helpDir)).created).toBe(names.length + guides.length + GLOSSARY.length);
  });
});
