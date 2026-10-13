import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { KB_KINDS, type KbKind } from '@cs/core';
import { type Db, kbArticle } from '@cs/db';
import { and, eq, inArray, isNotNull } from 'drizzle-orm';
import { saveArticle } from './write';

export interface SeedArticle {
  seedKey: string;
  title: string;
  kind: KbKind;
  body: string;
}

/** Parses the simple `---` block (`key: value` lines); throws naming the file. */
export function parseSeedFile(name: string, text: string): SeedArticle {
  const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(text.replace(/\r\n?/g, '\n'));
  if (!m) throw new Error(`${name}: missing front-matter block`);
  const fm: Record<string, string> = {};
  for (const line of m[1]!.split('\n')) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const kv = /^([A-Za-z_]+):\s*(.*?)\s*$/.exec(line);
    if (!kv) throw new Error(`${name}: bad front-matter line "${line}"`);
    fm[kv[1]!] = kv[2]!.replace(/^(["'])(.*)\1$/, '$2');
  }
  const seedKey = fm.seed_key ?? '';
  if (!/^[a-z0-9-]+$/.test(seedKey)) throw new Error(`${name}: seed_key is required and must match [a-z0-9-]+`);
  const title = fm.title ?? '';
  if (title.length < 1 || title.length > 200) throw new Error(`${name}: title is required (1 to 200 characters)`);
  const kind = fm.kind ?? 'help';
  if (!(KB_KINDS as readonly string[]).includes(kind)) throw new Error(`${name}: unknown kind "${kind}"`);
  const body = m[2]!.trim();
  if (!body) throw new Error(`${name}: empty body`);
  return { seedKey, title, kind: kind as KbKind, body };
}

/** Syncs `*.md` files in `dir` to platform seed rows (spec "Seed"). Validates every file before any write. */
export async function seedKnowledge(
  service: Db,
  dir: string,
  userId = 'system:seed',
): Promise<{ created: number; updated: number; removed: number; unchanged: number }> {
  const names = (await readdir(dir)).filter((n) => n.endsWith('.md')).sort();
  const articles: SeedArticle[] = [];
  const seen = new Map<string, string>();
  for (const n of names) {
    const a = parseSeedFile(n, await readFile(join(dir, n), 'utf8'));
    const dup = seen.get(a.seedKey);
    if (dup) throw new Error(`${n}: seed_key "${a.seedKey}" is also used by ${dup}`);
    seen.set(a.seedKey, n);
    articles.push(a);
  }

  const existing = await service.select().from(kbArticle).where(and(eq(kbArticle.source, 'seed'), isNotNull(kbArticle.seedKey)));
  const byKey = new Map(existing.map((r) => [r.seedKey!, r]));
  const out = { created: 0, updated: 0, removed: 0, unchanged: 0 };
  for (const a of articles) {
    const old = byKey.get(a.seedKey);
    if (old && old.title === a.title && old.bodyMd === a.body && old.kind === a.kind && old.status === 'published' && old.level === 'platform') {
      out.unchanged++;
      continue;
    }
    await saveArticle(
      service,
      userId,
      { ...(old && { id: old.id }), level: 'platform', kind: a.kind, title: a.title, bodyMd: a.body, status: 'published' },
      { source: 'seed', seedKey: a.seedKey },
    );
    out[old ? 'updated' : 'created']++;
  }
  const stale = existing.filter((r) => !seen.has(r.seedKey!)).map((r) => r.id);
  if (stale.length) {
    await service.delete(kbArticle).where(inArray(kbArticle.id, stale));
    out.removed = stale.length;
  }
  return out;
}
