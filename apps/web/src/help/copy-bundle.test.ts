import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { PAGE_COPY, type PageCopy } from './copy';
import { AGENCY_ONLY_CLIENT_KEYS } from './reach';

/**
 * Final review I1 (spec 15b §3): help copy reaches the browser only through the shell's audience-filtered `HelpProvider`
 * payload. No `'use client'` module may pull a value from `src/help/copy/*` into the client bundle, directly or through
 * a plain (non-`'use client'`, non-`'use server'`) module it imports. Only `import type` is erased everywhere: with
 * `verbatimModuleSyntax`, `import { type X }` keeps a side-effect import of the module, so it counts as a value edge.
 * A `'use server'` module is a boundary: the client gets action references, not its code.
 */
const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const COPY_DIR = join(SRC, 'help', 'copy');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return walk(p);
    return /\.(ts|tsx)$/.test(n) && !/\.test\.(ts|tsx)$/.test(n) ? [p] : [];
  });
}

const parsed = new Map<string, ts.SourceFile>();
function parse(file: string): ts.SourceFile {
  let sf = parsed.get(file);
  if (!sf) {
    sf = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    parsed.set(file, sf);
  }
  return sf;
}

function directive(sf: ts.SourceFile): 'client' | 'server' | null {
  for (const s of sf.statements) {
    if (!ts.isExpressionStatement(s) || !ts.isStringLiteral(s.expression)) break;
    if (s.expression.text === 'use client') return 'client';
    if (s.expression.text === 'use server') return 'server';
  }
  return null;
}

function resolveLocal(from: string, spec: string): string | null {
  const base = spec.startsWith('@/') ? join(SRC, spec.slice(2)) : spec.startsWith('.') ? resolve(dirname(from), spec) : null;
  if (!base) return null;
  for (const c of [base, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts'), join(base, 'index.tsx')]) {
    if (existsSync(c) && statSync(c).isFile()) return c;
  }
  return null;
}

/** Module specifiers this file loads at runtime (type-only imports and re-exports are erased). */
export function valueImports(sf: ts.SourceFile): string[] {
  const out: string[] = [];
  const visit = (n: ts.Node) => {
    if (ts.isImportDeclaration(n) && ts.isStringLiteral(n.moduleSpecifier) && !n.importClause?.isTypeOnly) out.push(n.moduleSpecifier.text);
    else if (ts.isExportDeclaration(n) && n.moduleSpecifier && ts.isStringLiteral(n.moduleSpecifier) && !n.isTypeOnly) out.push(n.moduleSpecifier.text);
    else if (ts.isCallExpression(n) && n.expression.kind === ts.SyntaxKind.ImportKeyword && n.arguments[0] && ts.isStringLiteral(n.arguments[0])) out.push(n.arguments[0].text);
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

/** For each `'use client'` file, the first chain of value imports that reaches a `src/help/copy/*` module. */
function leaks(files: string[]): string[] {
  const found: string[] = [];
  for (const entry of files.filter((f) => directive(parse(f)) === 'client')) {
    const seen = new Set<string>([entry]);
    const queue: string[][] = [[entry]];
    while (queue.length) {
      const chain = queue.shift()!;
      const file = chain[chain.length - 1]!;
      if (file.startsWith(COPY_DIR)) {
        found.push(chain.map((f) => relative(SRC, f).replaceAll('\\', '/')).join(' -> '));
        break;
      }
      for (const spec of valueImports(parse(file))) {
        const next = resolveLocal(file, spec);
        if (!next || seen.has(next)) continue;
        seen.add(next);
        if (directive(parse(next)) === 'server') continue;
        queue.push([...chain, next]);
      }
    }
  }
  return found;
}

describe('help copy stays out of the client bundle', () => {
  it('no use-client module imports a value from src/help/copy, directly or through plain modules', () => {
    expect(leaks(walk(SRC))).toEqual([]);
  });

  it('server code passes an audience-restricted empty state to the browser only by key (HelpEmpty), never as text', () => {
    // A server page that spreads `COPY.empty.<agency-only id>` into the client `EmptyState` serialises the text into the
    // page's RSC payload even though EmptyState then renders nothing for a client. `<HelpEmpty id="…">` reads it from the
    // viewer's filtered payload instead. Pages only one audience reaches (agency-only client pages) are exempt.
    const restricted = (Object.entries(PAGE_COPY) as [string, PageCopy][])
      .filter(([page]) => (page.startsWith('client.') && !AGENCY_ONLY_CLIENT_KEYS.has(page)) || page.startsWith('account.'))
      .flatMap(([, c]) => Object.entries(c.empty ?? {}).filter(([, e]) => (e.audience ?? 'all') !== 'all').map(([id]) => id));
    expect(restricted.length).toBeGreaterThan(0);
    const hits: string[] = [];
    for (const f of walk(SRC)) {
      const src = readFileSync(f, 'utf8');
      for (const id of restricted) if (new RegExp(`\\.empty\\.${id}\\b|empty\\[['"]${id}['"]\\]`).test(src)) hits.push(`${relative(SRC, f).replaceAll('\\', '/')}: empty.${id}`);
    }
    expect(hits).toEqual([]);
  });

  it('the scan sees value imports and ignores type-only ones', () => {
    const sf = (code: string) => ts.createSourceFile('x.tsx', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    expect(valueImports(sf("import type { TipKey } from '@/help/copy';"))).toEqual([]);
    expect(valueImports(sf("export type { TipKey } from '@/help/copy';"))).toEqual([]);
    expect(valueImports(sf("import { type TipKey } from '@/help/copy';"))).toEqual(['@/help/copy']);
    expect(valueImports(sf("import { PAGE_COPY } from '@/help/copy';"))).toEqual(['@/help/copy']);
    expect(valueImports(sf("export { CLIENT_COPY } from './copy/client';"))).toEqual(['./copy/client']);
    expect(valueImports(sf("const m = await import('@/help/copy/agency');"))).toEqual(['@/help/copy/agency']);
  });
});
