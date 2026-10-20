import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { GLOSSARY, type GlossaryTerm, type HelpAudience, KB_KINDS, type KbKind, lintKbText } from '@cs/core';
import { type Db, kbArticle } from '@cs/db';
import { and, eq, inArray, isNotNull } from 'drizzle-orm';
import { saveArticle } from './write';

export interface SeedArticle {
  seedKey: string;
  title: string;
  kind: KbKind;
  body: string;
  /** Page guides and glossary rows only (15b). */
  helpKey?: string;
  audience?: HelpAudience;
  clientVisible?: boolean;
}

const AUDIENCES: readonly HelpAudience[] = ['all', 'agency', 'client', 'operator'];
export const GUIDE_SECTIONS = ['What this page tells you', 'How to use it', 'Common questions'] as const;

/** Parses a page guide (`docs/help/pages/<key>[.<audience>].md`); collects every problem instead of stopping at the first. */
export function parseGuideFile(name: string, text: string): { article?: SeedArticle; errors: string[] } {
  const errors: string[] = [];
  const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(text.replace(/\r\n?/g, '\n'));
  if (!m) return { errors: [`${name}: missing front-matter block`] };
  const fm: Record<string, string> = {};
  for (const line of m[1]!.split('\n')) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const kv = /^([A-Za-z_]+):\s*(.*?)\s*$/.exec(line);
    if (!kv) {
      errors.push(`${name}: bad front-matter line "${line}"`);
      continue;
    }
    fm[kv[1]!] = kv[2]!.replace(/^(["'])(.*)\1$/, '$2');
  }
  const helpKey = fm.help_key ?? '';
  const title = fm.title ?? '';
  const audience = fm.audience ?? '';
  const body = m[2]!.trim();
  if (!helpKey) errors.push(`${name}: help_key is required`);
  if (title.length < 1 || title.length > 200) errors.push(`${name}: title is required (1 to 200 characters)`);
  if (!(AUDIENCES as readonly string[]).includes(audience)) errors.push(`${name}: unknown audience "${audience}" (use ${AUDIENCES.join(', ')})`);

  // The file name carries the key; a trailing `.<audience>` segment is optional but must agree with the front matter.
  let stem = name.replace(/\.md$/, '');
  const suffix = /\.([a-z]+)$/.exec(stem)?.[1];
  if (suffix && (AUDIENCES as readonly string[]).includes(suffix)) {
    if (suffix !== audience) errors.push(`${name}: file-name audience "${suffix}" does not match front-matter audience "${audience}"`);
    stem = stem.slice(0, -(suffix.length + 1));
  }
  if (helpKey && helpKey !== `page:${stem}`) errors.push(`${name}: help_key "${helpKey}" must be "page:${stem}" to match the file name`);

  const h2: string[] = [];
  let fence = false;
  for (const line of body.split('\n')) {
    if (/^\s{0,3}(```|~~~)/.test(line)) fence = !fence;
    else if (!fence) {
      const h = /^## (.+?)\s*$/.exec(line);
      if (h) h2.push(h[1]!);
    }
  }
  if (h2.join('\n') !== GUIDE_SECTIONS.join('\n')) {
    errors.push(`${name}: H2 sections must be exactly "${GUIDE_SECTIONS.join('", "')}" in that order (found ${h2.length ? `"${h2.join('", "')}"` : 'none'})`);
  }
  for (const w of lintKbText('platform', `${title}\n${body}`)) errors.push(`${name}: ${w}`);
  if (errors.length) return { errors };
  const a = audience as HelpAudience;
  return { article: { seedKey: `${helpKey}#${a}`, title, kind: 'help', body, helpKey, audience: a, clientVisible: a === 'all' || a === 'client' }, errors };
}

export function glossaryArticle(t: GlossaryTerm): SeedArticle {
  return {
    seedKey: `glossary:${t.id}#${t.audience}`,
    title: t.term,
    kind: 'help',
    body: t.long ? `${t.short}\n\n${t.long}` : t.short,
    helpKey: `glossary:${t.id}`,
    audience: t.audience,
    clientVisible: t.audience === 'all' || t.audience === 'client',
  };
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

/**
 * Syncs `*.md` files in `dir`, page guides in `dir/pages/` (if present) and the glossary to platform seed rows
 * (spec "Seed"). Validates everything before any write; guide and glossary problems are reported together.
 * One pass covers all sources because the stale sweep removes every seed row this run did not produce.
 */
export async function seedKnowledge(
  service: Db,
  dir: string,
  userId = 'system:seed',
  opts: { glossary?: readonly GlossaryTerm[] } = {},
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

  const problems: string[] = [];
  const pagesDir = join(dir, 'pages');
  const guideNames = await readdir(pagesDir).then(
    (l) => l.filter((n) => n.endsWith('.md')).sort(),
    (e: NodeJS.ErrnoException) => {
      if (e.code === 'ENOENT') return [];
      throw e;
    },
  );
  const addHelp = (a: SeedArticle, source: string) => {
    const dup = seen.get(a.seedKey);
    if (dup) problems.push(`${source}: duplicate key+audience "${a.seedKey}" (also ${dup})`);
    else {
      seen.set(a.seedKey, source);
      articles.push(a);
    }
  };
  for (const n of guideNames) {
    const r = parseGuideFile(n, await readFile(join(pagesDir, n), 'utf8'));
    problems.push(...r.errors);
    if (r.article) addHelp(r.article, `pages/${n}`);
  }
  for (const t of opts.glossary ?? GLOSSARY) {
    if (!(AUDIENCES as readonly string[]).includes(t.audience)) {
      problems.push(`glossary:${t.id}: unknown audience "${t.audience}"`);
      continue;
    }
    const a = glossaryArticle(t);
    problems.push(...lintKbText('platform', `${a.title}\n${a.body}`).map((w) => `glossary:${t.id}: ${w}`));
    addHelp(a, `glossary:${t.id}`);
  }
  if (problems.length) throw new Error(`Help seed validation failed (${problems.length}):\n- ${problems.join('\n- ')}`);

  const existing = await service.select().from(kbArticle).where(and(eq(kbArticle.source, 'seed'), isNotNull(kbArticle.seedKey)));
  const byKey = new Map(existing.map((r) => [r.seedKey!, r]));
  const out = { created: 0, updated: 0, removed: 0, unchanged: 0 };
  for (const a of articles) {
    const old = byKey.get(a.seedKey);
    if (old && old.title === a.title && old.bodyMd === a.body && old.kind === a.kind && old.status === 'published' && old.level === 'platform' && old.helpKey === (a.helpKey ?? null) && old.audience === (a.audience ?? 'all') && old.clientVisible === (a.clientVisible ?? true)) {
      out.unchanged++;
      continue;
    }
    await saveArticle(
      service,
      userId,
      { ...(old && { id: old.id }), level: 'platform', kind: a.kind, title: a.title, bodyMd: a.body, status: 'published' },
      { source: 'seed', seedKey: a.seedKey, helpKey: a.helpKey ?? null, audience: a.audience ?? 'all', clientVisible: a.clientVisible ?? true },
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
