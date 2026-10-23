import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { GLOSSARY } from '@cs/core';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { AGENCY_ONLY_TERMS } from '@/lib/agency-only-terms';
import { CLIENT_AUDIENCE_MAPS } from '@/lib/labels';

/**
 * Phase 15b-2 C3 guard: "theme" (in the review sense) never appears in user-facing text; the word is "topic".
 * Identifiers and DB names may keep `theme`, but the route (`/platform/themes`), query param (`?theme=`) and page key
 * (`page:platform.themes`) were renamed in 15b-3b and are reported if they return, so only string literals, template text, JSX text, guide Markdown and the glossary are
 * scanned (comments and identifiers are not). A second guard keeps the assistant's name out of hard-coded strings.
 */
const SRC = __dirname;
const ROOT = join(__dirname, '..', '..', '..');

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name) && !name.endsWith('.d.ts')) out.push(p);
  }
  return out;
}

type Hit = { where: string; text: string };
type Text = { line: number; text: string; kind: 'string' | 'jsx' };

/** Every user-visible-capable text node of a source file: string/template literals and JSX text, not comments or names. */
function textsOf(file: string): Text[] {
  const src = readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const out: Text[] = [];
  const add = (n: ts.Node, text: string, kind: Text['kind']) => out.push({ line: sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1, text, kind });
  const visit = (n: ts.Node) => {
    if (ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) return;
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) {
      const p = n.parent;
      const isKey = (ts.isPropertyAssignment(p) && p.name === n) || (ts.isElementAccessExpression(p) && p.argumentExpression === n);
      if (!isKey) add(n, n.text, 'string');
    } else if (ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n)) add(n, n.text, 'string');
    else if (ts.isJsxText(n)) { if (n.text.trim()) add(n, n.text, 'jsx'); }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

const THEME = /\b(un)?theme(s|d)?\b/i;
/**
 * Narrow allow-list for string literals that match THEME but are identifiers, not prose. A string is allowed only if it has
 * no whitespace and is all lowercase / route / query / key characters: `theme`, `themes`. Prose and capitalised labels ("Theme", "All themes") are never allowed. JSX text is never allowed.
 */
const IDENTIFIER_LIKE = /^[a-z0-9_:/.?=&#[\]-]+$/;
/** Retired identifiers (15b-3b): the route, query param and help key were renamed to topic(s); none may come back. */
const RETIRED_IDENTIFIER = /platform\/themes|platform\.themes|\?theme=/;
/** True when a string literal is an allowed identifier-like use of "theme" (not prose, not a retired route/key). */
export const isAllowedThemeString = (text: string) => IDENTIFIER_LIKE.test(text) && !RETIRED_IDENTIFIER.test(text);
/** UI-theme senses (brand colours, dark/light) that legitimately use the word inside a string: none today; add a snippet here with a reason. */
const UI_THEME_STRINGS: string[] = [];
/** Model-facing prompt files exempt from the scan: none (vertical-draft.ts no longer says "theme"). */
const MODEL_PROMPT_FILES = new Set<string>();

const rel = (f: string) => relative(ROOT, f).split(sep).join('/');

function themeHits(files: string[]): Hit[] {
  const hits: Hit[] = [];
  for (const f of files) {
    if (MODEL_PROMPT_FILES.has(rel(f))) continue;
    for (const t of textsOf(f)) {
      if (!THEME.test(t.text)) continue;
      if (t.kind === 'string' && isAllowedThemeString(t.text)) continue;
      if (UI_THEME_STRINGS.some((s) => t.text.includes(s))) continue;
      hits.push({ where: `${rel(f)}:${t.line}`, text: t.text.slice(0, 100) });
    }
  }
  return hits;
}

const fmt = (hits: Hit[]) => hits.map((h) => `${h.where}  ${JSON.stringify(h.text)}`).join('\n');

describe('terminology: "theme" is "topic" in user-facing text (C3)', () => {
  it('reports the retired route, query param and help key', () => {
    for (const t of ['/platform/themes', 'page:platform.themes', '/platform/themes?theme=x', '?theme=']) expect(isAllowedThemeString(t), t).toBe(false);
    for (const t of ['theme', 'themes', '/platform/topics']) expect(isAllowedThemeString(t), t).toBe(true);
  });

  it('no string literal, template text or JSX text under apps/web/src says theme', () => {
    const hits = themeHits(walk(SRC));
    expect(hits, `Found "theme" in user-facing text; say "topic":\n${fmt(hits)}`).toEqual([]);
  });

  it('no user-facing label in the packages says theme (Ask progress labels, workspace labels)', () => {
    // Final review I2: labels outside apps/web that the UI shows verbatim. Object keys (tool names) are identifiers.
    const LABEL_FILES = ['packages/ask/src/labels.ts', 'packages/tools/src/workspace/labels.ts'].map((f) => join(ROOT, f));
    const hits = themeHits(LABEL_FILES);
    expect(hits, `Found "theme" in a user-facing label; say "topic":\n${fmt(hits)}`).toEqual([]);
  });

  it('no help guide says theme', () => {
    const dir = join(ROOT, 'docs', 'help', 'pages');
    const hits: Hit[] = [];
    for (const name of readdirSync(dir).filter((n) => n.endsWith('.md'))) {
      readFileSync(join(dir, name), 'utf8').split('\n').forEach((line, i) => {
        if (THEME.test(line)) hits.push({ where: `docs/help/pages/${name}:${i + 1}`, text: line }); });
    }
    expect(hits, `Found "theme" in a guide:\n${fmt(hits)}`).toEqual([]);
  });

  it('the glossary has a "topic" term and no "theme" in any term, short or long text', () => {
    const topic = GLOSSARY.find((e) => e.id === 'topic');
    expect(topic?.term).toBe('Topic');
    expect(GLOSSARY.find((e) => e.id === 'theme')).toBeUndefined();
    for (const e of GLOSSARY) {
      expect(`${e.term} ${e.short} ${e.long ?? ''}`, e.id).not.toMatch(THEME);
      for (const ref of e.seeAlso ?? []) expect(GLOSSARY.some((g) => g.id === ref), `${e.id} -> ${ref}`).toBe(true);
    }
  });
});

describe('terminology: the assistant name is never hard-coded', () => {
  /** Files where "Friday" is the intended default name, not a hard-coded label: the default resolvers and the branding editor's placeholder. */
  const DEFAULT_NAME_FILES = new Set([
    'apps/web/src/server/theme.ts',
    'apps/web/src/server/nav.ts',
    'apps/web/src/server/ask.ts',
    'apps/web/src/app/(platform)/platform/ask/[threadId]/page.tsx',
    'apps/web/src/components/shell/app-shell.tsx',
    'apps/web/src/components/shell/nav-items.ts',
    'apps/web/src/components/agency/branding-editor.tsx',
  ]);
  it('no user-facing string says Friday outside the default-name files', () => {
    const hits: Hit[] = [];
    for (const f of walk(SRC)) {
      if (DEFAULT_NAME_FILES.has(rel(f))) continue;
      for (const t of textsOf(f)) if (/\bFriday\b/.test(t.text)) hits.push({ where: `${rel(f)}:${t.line}`, text: t.text.slice(0, 100) });
    }
    expect(hits, `Hard-coded "Friday"; use the agency's assistantName:\n${fmt(hits)}`).toEqual([]);
  });

  it('no help guide and no glossary entry says Friday ({{assistant}} in guides, no placeholder in the glossary)', () => {
    const dir = join(ROOT, 'docs', 'help', 'pages');
    const hits: Hit[] = [];
    for (const name of readdirSync(dir).filter((n) => n.endsWith('.md'))) {
      readFileSync(join(dir, name), 'utf8').split('\n').forEach((line, i) => {
        if (/\bFriday\b/.test(line)) hits.push({ where: `docs/help/pages/${name}:${i + 1}`, text: line });
      });
    }
    for (const e of GLOSSARY) if (/\bFriday\b/.test(`${e.term} ${e.short} ${e.long ?? ''}`)) hits.push({ where: `glossary:${e.id}`, text: e.short });
    expect(hits, `Hard-coded "Friday" in help content:\n${fmt(hits)}`).toEqual([]);
  });
});

describe('terminology: client-audience enum labels', () => {
  it('say neither theme nor a hard-coded assistant name, and no agency-only product words', () => {
    for (const map of CLIENT_AUDIENCE_MAPS) for (const [k, { label }] of Object.entries(map)) {
      expect(label, k).not.toMatch(THEME);
      expect(label, k).not.toMatch(/Friday/);
      expect(label, k).not.toMatch(AGENCY_ONLY_TERMS);
    }
  });
});
